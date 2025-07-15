import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

interface ReferralPageProps {
  params: { code: string };
}

export default async function ReferralPage({ params }: ReferralPageProps) {
  const { code } = params;

  try {
    // Validate username exists
    const referrer = await prisma.user.findUnique({
      where: { username: code },
      select: { id: true, username: true },
    });

    if (!referrer) {
      // Invalid username, redirect to home
      redirect("/");
    }

    // Store referrer username in cookies for later use during signup
    const cookieStore = await cookies();
    cookieStore.set("referrerUsername", code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Redirect to home page where user can sign up
    redirect("/?ref=" + code);
  } catch (error) {
    console.error("Error processing referral:", error);
    redirect("/");
  }
}