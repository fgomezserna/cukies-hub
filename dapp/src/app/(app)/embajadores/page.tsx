import type { Metadata } from "next";

import { AmbassadorProgram } from "@/components/ambassadors/ambassador-program";

export const metadata: Metadata = {
  title: "Embajadores | Cukies World",
  description:
    "Invita a otros jugadores y consulta las comisiones UKI que generan sus premios.",
};

export const dynamic = "force-dynamic";

export default function AmbassadorsPage() {
  return <AmbassadorProgram />;
}
