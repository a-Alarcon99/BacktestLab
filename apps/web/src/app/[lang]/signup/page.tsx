import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/signup", title: t("Crear cuenta", "Create account"), noindex: true });
}

export default async function SignupPage() {
  const { t } = await getI18n();
  return (
    <div className="container-page flex flex-col gap-6 py-10 lg:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 text-center">
        <h1>{t("Crear cuenta", "Create account")}</h1>
        <p className="text-muted-foreground">
          {t(
            "Regístrate gratis: más backtests y estrategias que como invitado.",
            "Sign up for free: more backtests and strategies than as a guest."
          )}
        </p>
      </div>
      <AuthForm mode="signup" />
    </div>
  );
}
