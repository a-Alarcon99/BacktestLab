import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignupPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-10 lg:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 text-center">
        <h1>Crear cuenta</h1>
        <p className="text-muted-foreground">
          Regístrate gratis: más backtests y estrategias que como invitado.
        </p>
      </div>
      <AuthForm mode="signup" />
    </div>
  );
}
