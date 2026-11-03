const query = matchMedia("(prefers-color-scheme: dark)");

export const colorScheme = $state({ dark: query.matches });

function apply() {
  colorScheme.dark = query.matches;
  document.documentElement.classList.toggle("dark", query.matches);
}

// shadcn's dark tokens hang off the .dark class; keep it in sync with the OS setting
export function followColorScheme() {
  apply();
  query.addEventListener("change", apply);
}
