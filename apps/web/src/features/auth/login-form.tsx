"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { login } from "@/api/generated/endpoints/auth/auth";
import { dataOf } from "@/api/unwrap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { applyServerFieldErrors } from "./field-errors";
import { loginSchema, validationMessageKey, type LoginValues } from "./schemas";
import { useAuthStore } from "./store";
import { useErrorMessage } from "./use-error-message";

const FIELDS = ["email", "password"] as const;

export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const router = useNextRouter();
  const queryClient = useQueryClient();
  const search = useSearchParams();
  const next = search.get("next");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => login(values),
    onSuccess: (response) => {
      const session = dataOf(response);
      if (!session) return;
      useAuthStore.getState().setSession(session);
      void queryClient.invalidateQueries();
      router.replace(safeNextPath(next, locale));
    },
    onError: (error) => {
      applyServerFieldErrors(error, setError, FIELDS, (field, code) =>
        t(`validation.${validationMessageKey(field, code)}`),
      );
    },
  });

  const message = (field: (typeof FIELDS)[number]) => {
    const error = errors[field];
    return error ? t(`validation.${validationMessageKey(field, error.type)}`) : undefined;
  };
  const showFormError = mutation.isError && Object.keys(errors).length === 0;
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          mutation.mutate(values);
        })(event);
      }}
      className="flex flex-col gap-4"
    >
      {showFormError ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Field data-invalid={errors.email ? true : undefined}>
        <FieldLabel htmlFor="login-email">{t("email")}</FieldLabel>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? <FieldError id="login-email-error">{message("email")}</FieldError> : null}
      </Field>

      <Field data-invalid={errors.password ? true : undefined}>
        <FieldLabel htmlFor="login-password">{t("password")}</FieldLabel>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <FieldError id="login-password-error">{message("password")}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" size="lg" disabled={mutation.isPending}>
        {mutation.isPending ? t("submitting") : t("submitLogin")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href={registerHref}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("goRegister")}
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">{t("demoHint")}</p>
    </form>
  );
}
