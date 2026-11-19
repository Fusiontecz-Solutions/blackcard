import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = 'ih-crm-theme';

// Get system theme preference
const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Resolve theme based on setting
const resolveTheme = (theme: Theme): ResolvedTheme => {
    if (theme === 'system') {
        return getSystemTheme();
    }
    return theme;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
            return stored || 'light';
        }
        return 'light';
    });

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

    // Update resolved theme when theme changes or system preference changes
    const updateResolvedTheme = useCallback(() => {
        const newResolvedTheme = resolveTheme(theme);
        setResolvedTheme(newResolvedTheme);
    }, [theme]);

    // Listen for system theme changes
    useEffect(() => {
        updateResolvedTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = () => {
            // Always update when system changes, if theme is set to 'system'
            if (theme === 'system') {
                const systemTheme = mediaQuery.matches ? 'dark' : 'light';
                setResolvedTheme(systemTheme);
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, updateResolvedTheme]);

    // Apply theme to document
    useEffect(() => {
        const root = window.document.documentElement;

        // Remove previous theme class
        root.classList.remove('light', 'dark');

        // Add current resolved theme class
        root.classList.add(resolvedTheme);

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute(
                'content',
                resolvedTheme === 'dark' ? '#141517' : '#f8fafc'
            );
        }
    }, [resolvedTheme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

