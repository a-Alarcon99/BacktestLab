import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-10 lg:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 text-center">
        <h1>Iniciar sesión</h1>
        <p className="text-muted-foreground">Accede a tu cuenta para usar los límites del plan gratuito.</p>
      </div>
      <AuthForm mode="login" />
    </div>
  );
}
