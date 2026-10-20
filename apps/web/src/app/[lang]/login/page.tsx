import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/login", title: t("Iniciar sesión", "Sign in"), noindex: true });
}

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <div className="container-page flex flex-col gap-6 py-10 lg:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 text-center">
        <h1>{t("Iniciar sesión", "Sign in")}</h1>
        <p className="text-muted-foreground">
          {t("Accede a tu cuenta para usar los límites del plan gratuito.", "Sign in to your account to use the free plan's limits.")}
        </p>
      </div>
      <AuthForm mode="login" />
    </div>
  );
}
