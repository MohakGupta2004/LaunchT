"use client"
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/ui/shadcn-io/dropzone';
import '@solana/wallet-adapter-react-ui/styles.css';
import {
    useState
} from "react"
import {
    toast
} from "sonner"
import {
    useForm
} from "react-hook-form"
import {
    zodResolver
} from "@hookform/resolvers/zod"
import {
    z
} from "zod"
import {
    Button
} from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Input
} from "@/components/ui/input"
import { WalletDisconnectButton, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';

export const formSchema = z.object({
    name: z.string().min(1),
    symbol: z.string().min(1),
    uri: z.string(),
});

export default function TokenDetails({ getMetaData,  updateCreate }: {
    getMetaData: (data: z.infer<typeof formSchema>) => Promise<void>
    updateCreate: (value: boolean) => Promise<boolean> 
}) {
    const [files, setFiles] = useState<File[] | undefined>();
    const {wallet} = useWallet()
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [url, setUrl] = useState<string | null>(null);
    const handleDrop = (files: File[]) => {
        console.log(files);
        setFiles(files);
    }
;
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            symbol: "",
            uri: ""
        },
    })
    const uploadFile = async () => {
        try {
            if (!files || files.length === 0) {
                alert("No file selected");
                return;
            }
            if(!wallet) {
                return;
            }

            setUploading(true);
            const data = new FormData();
            data.set("file", files[0]);
            data.set("name", form.getValues("name"));
            data.set("symbol", form.getValues("symbol"));
            // Upload to our API
            const uploadRequest = await fetch("/api/files", {
                method: "POST",
                body: data,
            });
            const signedUrl = await uploadRequest.json();
            setUrl(signedUrl);
            setUploading(false);
            return signedUrl;
        } catch (e) {
            console.log(e);
            setUploading(false);
            alert("Trouble uploading file");
        }
    };
    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            if (!files || files.length === 0) {
                toast.error("Please upload at least one file.");
                return;
            }
            if(!wallet) {
                toast.error("Please connect Wallet")
                return;
            }

            // Upload file first
            setUploading(true);
            const imgUrl = await uploadFile();
            setUploading(false);
            console.log("Image URL:", url);
            values.uri = imgUrl;

            // Set creating state
            setCreating(true);
            await updateCreate(true);
            
            // Create token
            await getMetaData(values);
            
            // Reset form after success
            form.reset();
            setFiles(undefined);
            setUrl(null);
            setCreating(false);
            await updateCreate(false);
            
        } catch (error) {
            console.error("Form submission error", error);
            toast.error("Failed to submit the form. Please try again.");
            setCreating(false);
            await updateCreate(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl mx-auto py-10">
                <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white text-center mt-4">LaunchT - Launch Your Own Token</h1>
                <WalletMultiButton/>
                <WalletDisconnectButton/>
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Solana"

                                    type=""
                                    {...field} />
                            </FormControl>
                            <FormDescription>What is the name of your token?</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="symbol"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Symbol</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="SOL"

                                    type=""
                                    {...field} />
                            </FormControl>
                            <FormDescription>What is the symbol of your token?</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Dropzone
                    maxFiles={3}
                    onDrop={handleDrop}
                    onError={console.error}
                    src={files}
                >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                </Dropzone>
                <Button type="submit" disabled={uploading || creating}>{uploading ? "Uploading..." : creating ? "Creating..." : "Submit"}</Button>
            </form>
        </Form>
    )
}