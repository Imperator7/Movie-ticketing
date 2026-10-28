"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-states";
import { GuestOnly } from "./guest-only";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GuestOnly>
      <PageContainer>
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-lg">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </header>
          {children}
        </div>
      </PageContainer>
    </GuestOnly>
  );
}

export function LoginView() {
  const t = useTranslations("auth");
  return (
    <AuthCard title={t("loginTitle")} subtitle={t("loginSubtitle")}>
      <LoginForm />
    </AuthCard>
  );
}

export function RegisterView() {
  const t = useTranslations("auth");
  return (
    <AuthCard title={t("registerTitle")} subtitle={t("registerSubtitle")}>
      <RegisterForm />
    </AuthCard>
  );
}
