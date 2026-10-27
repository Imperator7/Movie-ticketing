export type LoginMethod = "PASSWORD" | "LINE";

/** `PASSWORD` when a password hash is set, plus one entry per distinct linked provider. */
export function loginMethods(
  user: { passwordHash: string | null },
  identities: readonly { provider: "LINE" }[],
): LoginMethod[] {
  const methods: LoginMethod[] = [];
  if (user.passwordHash !== null) methods.push("PASSWORD");
  for (const provider of new Set(identities.map((identity) => identity.provider))) {
    methods.push(provider);
  }
  return methods;
}
