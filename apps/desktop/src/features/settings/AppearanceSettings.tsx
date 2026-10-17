import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { AppTheme } from "../../types/electron-api";

export interface AppearanceSettingsProps {
  theme: AppTheme;
  disabled?: boolean;
  onChange: (theme: AppTheme) => void;
}

interface ThemeOptionDefinition {
  value: AppTheme;
  label: string;
  description: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: readonly ThemeOptionDefinition[] = [
  {
    value: "light",
    label: "Light",
    description: "Light surfaces and high-contrast dark text",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Default dark studio palette",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow the operating system color scheme",
    icon: Monitor,
  },
];

/**
 * Synchronizes the active theme token with the root HTML element so variables.css
 * rules (:root[data-theme="light"] and :root[data-theme="system"]) take effect immediately.
 */
export function applyAppTheme(theme: AppTheme): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = theme;
  }
}

export function AppearanceSettings({
  theme,
  disabled = false,
  onChange,
}: AppearanceSettingsProps) {
  const handleSelectTheme = (nextTheme: AppTheme) => {
    applyAppTheme(nextTheme);
    onChange(nextTheme);
  };

  return (
    <section className="p6-panel" aria-label="Appearance settings">
      <div className="p6-panel-heading">
        <div>
          <h2>Appearance</h2>
          <p>Select how the desktop studio interface should be displayed.</p>
        </div>
        <Sun size={19} aria-hidden="true" />
      </div>

      <fieldset className="p6-theme-options" disabled={disabled}>
        <legend>Application theme</legend>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = theme === option.value;
          return (
            <label
              key={option.value}
              className={`p6-theme-option ${isSelected ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={isSelected}
                onChange={() => handleSelectTheme(option.value)}
              />
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {isSelected && <Check size={16} aria-hidden="true" />}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}