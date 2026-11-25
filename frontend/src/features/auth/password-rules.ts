/** Reglas de contraseña del portal; Keycloak aplica la misma política (10 caracteres, mayúscula, minúscula y número). */
export const PASSWORD_RULES: [RegExp, string][] = [
  [/.{10,}/, "10 caracteres o más"],
  [/[A-Z]/, "una mayúscula"],
  [/[a-z]/, "una minúscula"],
  [/\d/, "un número"],
];

export const missingRules = (password: string) => PASSWORD_RULES.filter(([rule]) => !rule.test(password)).map(([, label]) => label);
