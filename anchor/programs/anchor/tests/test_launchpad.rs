/// Integration tests for the launchpad program using LiteSVM.
/// Run AFTER `anchor build` so target/deploy/launchpad.so exists.
/// Usage: anchor build && cargo test
use anchor_lang::{
    solana_program::{instruction::Instruction, system_instruction},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::token::{spl_token, TokenAccount};
use launchpad::{
    accounts,
    instruction,
    state::{Investment, Project},
    CreateProjectParams, INVESTMENT_SEED, PROJECT_SEED, VAULT_SEED,
};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

// ─── Constants ────────────────────────────────────────────────────────────────

/// Standard rent values for SPL accounts (empirical, consistent with LiteSVM defaults).
const MINT_RENT: u64 = 1_461_600;
const TOKEN_ACCOUNT_RENT: u64 = 2_039_280;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn program_id() -> anchor_lang::prelude::Pubkey {
    launchpad::id()
}

fn project_pda(token_mint: &anchor_lang::prelude::Pubkey) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[PROJECT_SEED, token_mint.as_ref()],
        &program_id(),
    )
    .0
}

fn vault_pda(project: &anchor_lang::prelude::Pubkey) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[VAULT_SEED, project.as_ref()],
        &program_id(),
    )
    .0
}

fn investment_pda(
    project: &anchor_lang::prelude::Pubkey,
    investor: &anchor_lang::prelude::Pubkey,
) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[INVESTMENT_SEED, project.as_ref(), investor.as_ref()],
        &program_id(),
    )
    .0
}

fn send(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    signers: &[&Keypair],
    payer: &Keypair,
) -> Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers)
            .expect("failed to sign tx");
    svm.send_transaction(tx)
}

fn setup_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/launchpad.so");
    svm.add_program(program_id(), bytes).unwrap();
    svm
}

/// Creates a mint, initialises it, and returns the mint keypair.
fn create_mint(svm: &mut LiteSVM, authority: &Keypair, payer: &Keypair) -> Keypair {
    let mint = Keypair::new();
    let create_ix = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        MINT_RENT,
        82,
        &spl_token::id(),
    );
    let init_ix = spl_token::instruction::initialize_mint2(
        &spl_token::id(),
        &mint.pubkey(),
        &authority.pubkey(),
        None,
        9,
    )
    .unwrap();
    send(svm, &[create_ix, init_ix], &[payer, &mint], payer).expect("create mint failed");
    mint
}

/// Creates a token account and returns its keypair.
fn create_token_account(
    svm: &mut LiteSVM,
    mint: &anchor_lang::prelude::Pubkey,
    owner: &Keypair,
    payer: &Keypair,
) -> Keypair {
    let token_account = Keypair::new();
    let create_ix = system_instruction::create_account(
        &payer.pubkey(),
        &token_account.pubkey(),
        TOKEN_ACCOUNT_RENT,
        165,
        &spl_token::id(),
    );
    let init_ix = spl_token::instruction::initialize_account3(
        &spl_token::id(),
        &token_account.pubkey(),
        mint,
        &owner.pubkey(),
    )
    .unwrap();
    send(svm, &[create_ix, init_ix], &[payer, &token_account], payer)
        .expect("create token account failed");
    token_account
}

/// Mints tokens to a token account.
fn mint_tokens(
    svm: &mut LiteSVM,
    mint: &anchor_lang::prelude::Pubkey,
    to: &anchor_lang::prelude::Pubkey,
    mint_authority: &Keypair,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        mint,
        to,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    send(svm, &[ix], &[mint_authority], mint_authority).expect("mint_to failed");
}

fn get_project(svm: &LiteSVM, project: &anchor_lang::prelude::Pubkey) -> Project {
    let account = svm.get_account(project).expect("project account not found");
    Project::try_deserialize(&mut account.data.as_ref()).expect("deserialize project failed")
}

fn get_investment(svm: &LiteSVM, pda: &anchor_lang::prelude::Pubkey) -> Investment {
    let account = svm.get_account(pda).expect("investment account not found");
    Investment::try_deserialize(&mut account.data.as_ref()).expect("deserialize investment failed")
}

fn get_token_account_balance(svm: &LiteSVM, pubkey: &anchor_lang::prelude::Pubkey) -> u64 {
    let account = svm.get_account(pubkey).expect("token account not found");
    TokenAccount::try_deserialize(&mut account.data.as_ref())
        .expect("deserialize token account failed")
        .amount
}

fn default_params(name: &str) -> CreateProjectParams {
    CreateProjectParams {
        name: name.to_string(),
        symbol: "TST".to_string(),
        description: "Test project".to_string(),
        target_raise: 10_000_000_000, // 10 SOL
        token_price: 1_000_000,       // 0.001 SOL per token
        total_tokens_for_sale: 1_000_000 * 10u64.pow(9),
    }
}

// ─── Test: create_project ─────────────────────────────────────────────────────

#[test]
fn test_create_project() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());

    let ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: default_params("Alpha"),
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );

    let res = send(&mut svm, &[ix], &[&owner], &owner);
    assert!(res.is_ok(), "create_project failed: {:?}", res.err());

    let project = get_project(&svm, &pda);
    assert_eq!(project.name, "Alpha");
    assert_eq!(project.symbol, "TST");
    assert_eq!(project.owner, owner.pubkey());
    assert_eq!(project.token_mint, mint.pubkey());
    assert!(project.is_active);
    assert!(!project.tokens_deposited);
    assert_eq!(project.raised_amount, 0);
    assert_eq!(project.sold_tokens, 0);
}

// ─── Test: multiple projects (different mints, same owner) ───────────────────

#[test]
fn test_create_multiple_projects() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();

    for name in ["Alpha", "Beta", "Gamma"] {
        let mint = create_mint(&mut svm, &owner, &owner);
        let pda = project_pda(&mint.pubkey());

        let ix = Instruction::new_with_bytes(
            program_id(),
            &instruction::CreateProject {
                params: default_params(name),
            }
            .data(),
            accounts::CreateProject {
                owner: owner.pubkey(),
                token_mint: mint.pubkey(),
                project: pda,
                system_program: anchor_lang::solana_program::system_program::id(),
            }
            .to_account_metas(None),
        );

        send(&mut svm, &[ix], &[&owner], &owner).expect(&format!("failed for {}", name));
        assert_eq!(get_project(&svm, &pda).name, name);
    }
}

// ─── Test: invest ─────────────────────────────────────────────────────────────

#[test]
fn test_invest() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    // Setup: create project + deposit tokens
    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    let total_tokens = 1_000_000 * 10u64.pow(9);
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, total_tokens);

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: total_tokens,
                ..default_params("Alpha")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();

    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    // Invest 1 SOL
    let investment_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 1_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: investment_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );

    let res = send(&mut svm, &[invest_ix], &[&investor], &investor);
    assert!(res.is_ok(), "invest failed: {:?}", res.err());

    let project = get_project(&svm, &pda);
    assert_eq!(project.raised_amount, 1_000_000_000);
    // tokens_received = 1_000_000_000 / 1_000_000 = 1000 tokens (raw)
    assert_eq!(project.sold_tokens, 1000);

    let inv = get_investment(&svm, &investment_pda);
    assert_eq!(inv.amount_invested, 1_000_000_000);
    assert_eq!(inv.tokens_allocated, 1000);
    assert_eq!(inv.tokens_claimed, 0);
    assert_eq!(inv.investor, investor.pubkey());
    assert_eq!(inv.project, pda);
}

// ─── Test: multiple investors ─────────────────────────────────────────────────

#[test]
fn test_multiple_investors() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    let total_tokens = 10_000u64;
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, total_tokens);

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: total_tokens,
                ..default_params("Multi")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();

    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    let investors: Vec<Keypair> = (0..3).map(|_| Keypair::new()).collect();
    let amounts = [1_000_000_000u64, 2_000_000_000, 3_000_000_000];

    for (inv_kp, amount) in investors.iter().zip(amounts.iter()) {
        svm.airdrop(&inv_kp.pubkey(), amount + 1_000_000_000).unwrap();
        let inv_pda = investment_pda(&pda, &inv_kp.pubkey());
        let ix = Instruction::new_with_bytes(
            program_id(),
            &instruction::Invest {
                amount_in_lamports: *amount,
            }
            .data(),
            accounts::Invest {
                investor: inv_kp.pubkey(),
                project: pda,
                investment: inv_pda,
                system_program: anchor_lang::solana_program::system_program::id(),
            }
            .to_account_metas(None),
        );
        send(&mut svm, &[ix], &[inv_kp], inv_kp).unwrap();
    }

    let project = get_project(&svm, &pda);
    assert_eq!(project.raised_amount, 6_000_000_000);
    assert_eq!(project.sold_tokens, 6000);
}

// ─── Test: withdraw_funds ─────────────────────────────────────────────────────

#[test]
fn test_withdraw_funds() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, 10_000);

    // create + deposit
    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: 10_000,
                ..default_params("Withdraw")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    // investor puts in 2 SOL
    let inv_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 2_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: inv_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[invest_ix], &[&investor], &investor).unwrap();

    let owner_before = svm.get_account(&owner.pubkey()).unwrap().lamports;

    // owner withdraws 1 SOL
    let withdraw_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::WithdrawFunds {
            amount: 1_000_000_000,
        }
        .data(),
        accounts::WithdrawFunds {
            owner: owner.pubkey(),
            project: pda,
        }
        .to_account_metas(None),
    );
    let res = send(&mut svm, &[withdraw_ix], &[&owner], &owner);
    assert!(res.is_ok(), "withdraw failed: {:?}", res.err());

    let project = get_project(&svm, &pda);
    assert_eq!(project.raised_amount, 1_000_000_000);

    let owner_after = svm.get_account(&owner.pubkey()).unwrap().lamports;
    // owner balance increases by ~1 SOL (minus tx fee)
    assert!(owner_after > owner_before);
}

// ─── Test: unauthorized withdrawal ───────────────────────────────────────────

#[test]
fn test_unauthorized_withdrawal() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let attacker = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, 10_000);

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: 10_000,
                ..default_params("Protect")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    let inv_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 1_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: inv_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[invest_ix], &[&investor], &investor).unwrap();

    // Attacker tries to withdraw (uses their own pubkey as owner)
    let mut metas = accounts::WithdrawFunds {
        owner: owner.pubkey(),
        project: pda,
    }
    .to_account_metas(None);
    // Override owner in account metas to attacker
    metas[0] = anchor_lang::solana_program::instruction::AccountMeta::new(
        attacker.pubkey(),
        true,
    );

    let bad_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::WithdrawFunds {
            amount: 1_000_000_000,
        }
        .data(),
        metas,
    );

    let res = send(&mut svm, &[bad_ix], &[&attacker], &attacker);
    assert!(res.is_err(), "unauthorized withdrawal should have failed");
}

// ─── Test: claim_tokens ───────────────────────────────────────────────────────

#[test]
fn test_claim_tokens() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    let total_tokens = 10_000u64;
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, total_tokens);

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: total_tokens,
                ..default_params("Claim")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    // Invest 1 SOL → 1000 raw token units
    let inv_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 1_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: inv_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[invest_ix], &[&investor], &investor).unwrap();

    // Derive investor ATA
    let investor_ata = anchor_spl::associated_token::get_associated_token_address(
        &investor.pubkey(),
        &mint.pubkey(),
    );

    let claim_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::ClaimTokens {}.data(),
        accounts::ClaimTokens {
            investor: investor.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            investment: inv_pda,
            vault,
            investor_ata,
            token_program: spl_token::id(),
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );

    let res = send(&mut svm, &[claim_ix], &[&investor], &investor);
    assert!(res.is_ok(), "claim_tokens failed: {:?}", res.err());

    let balance = get_token_account_balance(&svm, &investor_ata);
    assert_eq!(balance, 1000, "investor should have received 1000 raw token units");

    let inv = get_investment(&svm, &inv_pda);
    assert_eq!(inv.tokens_claimed, 1000);
    assert_eq!(inv.tokens_allocated, inv.tokens_claimed);
}

// ─── Test: double claim (should fail) ────────────────────────────────────────

#[test]
fn test_double_claim_prevented() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());
    let vault = vault_pda(&pda);
    let owner_ata = create_token_account(&mut svm, &mint.pubkey(), &owner, &owner);
    mint_tokens(&mut svm, &mint.pubkey(), &owner_ata.pubkey(), &owner, 10_000);

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: CreateProjectParams {
                token_price: 1_000_000,
                total_tokens_for_sale: 10_000,
                ..default_params("DoubleClaimTest")
            },
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    let deposit_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::DepositTokens {}.data(),
        accounts::DepositTokens {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            owner_token_account: owner_ata.pubkey(),
            vault,
            token_program: spl_token::id(),
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();
    send(&mut svm, &[deposit_ix], &[&owner], &owner).unwrap();

    let inv_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 1_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: inv_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[invest_ix], &[&investor], &investor).unwrap();

    let investor_ata = anchor_spl::associated_token::get_associated_token_address(
        &investor.pubkey(),
        &mint.pubkey(),
    );

    let claim_ix = || {
        Instruction::new_with_bytes(
            program_id(),
            &instruction::ClaimTokens {}.data(),
            accounts::ClaimTokens {
                investor: investor.pubkey(),
                token_mint: mint.pubkey(),
                project: pda,
                investment: inv_pda,
                vault,
                investor_ata,
                token_program: spl_token::id(),
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::id(),
            }
            .to_account_metas(None),
        )
    };

    // First claim — should succeed
    send(&mut svm, &[claim_ix()], &[&investor], &investor).expect("first claim should succeed");

    // Second claim — should fail with NothingToClaim
    let res = send(&mut svm, &[claim_ix()], &[&investor], &investor);
    assert!(res.is_err(), "second claim should have been rejected");
}

// ─── Test: invest before deposit_tokens (should fail) ────────────────────────

#[test]
fn test_invest_before_deposit_fails() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let investor = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&investor.pubkey(), 5_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &owner, &owner);
    let pda = project_pda(&mint.pubkey());

    let create_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::CreateProject {
            params: default_params("NoVault"),
        }
        .data(),
        accounts::CreateProject {
            owner: owner.pubkey(),
            token_mint: mint.pubkey(),
            project: pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );
    send(&mut svm, &[create_ix], &[&owner], &owner).unwrap();

    // Investing before deposit should fail (TokensNotDeposited)
    let inv_pda = investment_pda(&pda, &investor.pubkey());
    let invest_ix = Instruction::new_with_bytes(
        program_id(),
        &instruction::Invest {
            amount_in_lamports: 1_000_000_000,
        }
        .data(),
        accounts::Invest {
            investor: investor.pubkey(),
            project: pda,
            investment: inv_pda,
            system_program: anchor_lang::solana_program::system_program::id(),
        }
        .to_account_metas(None),
    );

    let res = send(&mut svm, &[invest_ix], &[&investor], &investor);
    assert!(res.is_err(), "invest before deposit should have failed");
}
