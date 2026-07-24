import { Suspense } from "react";
import { LoginForm } from "@/components/layout/LoginForm";

export const metadata = { title: "Connexion · E_Facture" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-900 via-blue-600 to-blue-300">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full bg-blue-400/30 blur-3xl" />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
