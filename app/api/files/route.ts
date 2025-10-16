import { NextResponse, type NextRequest } from "next/server";
import { pinata } from "@/utils/config"

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;
    const image = await pinata.upload.public.file(file)
    const imgUrl = await pinata.gateways.public.convert(image.cid);
    const metadata = {
      name: data.get("name"),
      symbol: data.get("symbol"),
      description: "Created via Solana Token Launchpad",
      image: imgUrl, // the Pinata URL of the uploaded image
      properties: {
        files: [
          {
            uri: imgUrl,
            type: "image/png"
          }
        ]
      }
    }

    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const fileUrl = new File([blob], "metadata.json", { type: "application/json" });
    const { cid } = await pinata.upload.public.file(fileUrl)
    const url = await pinata.gateways.public.convert(cid);

    console.log("Metadata URL:", url);
    return NextResponse.json(url, { status: 200 });
  } catch (e) {
    console.log(e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}