import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  await params;

  const cookieStore = await cookies();
  cookieStore.set("referrerUsername", "", { expires: new Date(0) });
  redirect("/");
}
