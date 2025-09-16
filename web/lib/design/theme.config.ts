// Design System Configuration
// Based on Refactoring UI principles and 8px grid system

export const theme = {
  // Spacing scale based on 8px grid
  spacing: {
    scale: [0, 4, 8, 16, 24, 32, 48, 64, 96, 128],
    // Semantic names for common use cases
    xs: 4,    // 0.5 * 8px
    sm: 8,    // 1 * 8px
    md: 16,   // 2 * 8px
    lg: 24,   // 3 * 8px
    xl: 32,   // 4 * 8px
    '2xl': 48, // 6 * 8px
    '3xl': 64, // 8 * 8px
    '4xl': 96, // 12 * 8px
  },

  // Typography scale with proper hierarchy
  typography: {
    scale: {
      caption: {
        size: 12,
        lineHeight: 16,
        tracking: 0.5,
        weight: 400,
        class: 'text-xs leading-4 tracking-wide'
      },
      body: {
        size: 14,
        lineHeight: 20,
        tracking: 0.25,
        weight: 400,
        class: 'text-sm leading-5 tracking-wide'
      },
      bodyLarge: {
        size: 16,
        lineHeight: 24,
        tracking: 0,
        weight: 400,
        class: 'text-base leading-6'
      },
      heading3: {
        size: 18,
        lineHeight: 28,
        tracking: -0.25,
        weight: 500,
        class: 'text-lg leading-7 tracking-tight font-medium'
      },
      heading2: {
        size: 24,
        lineHeight: 32,
        tracking: -0.5,
        weight: 600,
        class: 'text-2xl leading-8 tracking-tight font-semibold'
      },
      heading1: {
        size: 32,
        lineHeight: 40,
        tracking: -1,
        weight: 700,
        class: 'text-3xl leading-10 tracking-tight font-bold'
      },
      display: {
        size: 48,
        lineHeight: 48,
        tracking: -1.5,
        weight: 700,
        class: 'text-5xl leading-none tracking-tight font-bold'
      }
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // Color system optimized for dark theme
  colors: {
    // Primary palette with reduced saturation for dark theme
    primary: {
      50: 'hsl(173, 40%, 95%)',
      100: 'hsl(173, 40%, 90%)',
      200: 'hsl(173, 40%, 80%)',
      300: 'hsl(173, 40%, 70%)',
      400: 'hsl(173, 40%, 60%)',
      500: 'hsl(173, 40%, 50%)',  // Main primary
      600: 'hsl(173, 40%, 40%)',
      700: 'hsl(173, 40%, 30%)',
      800: 'hsl(173, 40%, 20%)',
      900: 'hsl(173, 40%, 10%)',
    },

    // Semantic colors for status
    success: {
      light: 'hsl(145, 50%, 60%)',
      main: 'hsl(145, 40%, 50%)',
      dark: 'hsl(145, 40%, 40%)',
      contrast: 'hsl(145, 5%, 95%)',
    },
    danger: {
      light: 'hsl(345, 70%, 60%)',
      main: 'hsl(345, 60%, 50%)',
      dark: 'hsl(345, 60%, 40%)',
      contrast: 'hsl(345, 5%, 95%)',
    },
    warning: {
      light: 'hsl(40, 70%, 60%)',
      main: 'hsl(40, 60%, 50%)',
      dark: 'hsl(40, 60%, 40%)',
      contrast: 'hsl(40, 5%, 10%)',
    },
    info: {
      light: 'hsl(210, 50%, 60%)',
      main: 'hsl(210, 40%, 50%)',
      dark: 'hsl(210, 40%, 40%)',
      contrast: 'hsl(210, 5%, 95%)',
    },

    // Gray scale with warm tint for softer dark theme
    gray: {
      50: 'hsl(220, 13%, 95%)',
      100: 'hsl(220, 13%, 91%)',
      200: 'hsl(220, 13%, 82%)',
      300: 'hsl(220, 13%, 64%)',
      400: 'hsl(220, 13%, 46%)',
      500: 'hsl(220, 13%, 36%)',
      600: 'hsl(220, 13%, 28%)',
      700: 'hsl(220, 13%, 20%)',
      800: 'hsl(220, 13%, 14%)',
      900: 'hsl(220, 13%, 9%)',
      950: 'hsl(220, 13%, 5%)',
    },

    // Background colors for dark theme elevation
    background: {
      base: 'hsl(220, 13%, 5%)',      // Lowest level
      raised: 'hsl(220, 13%, 7%)',     // Slightly raised
      overlay: 'hsl(220, 13%, 9%)',    // Cards, etc.
      elevated: 'hsl(220, 13%, 11%)',  // Dropdowns, modals
      highlight: 'hsl(220, 13%, 13%)', // Hover states
    },

    // Text colors with proper contrast
    text: {
      primary: 'hsl(0, 0%, 95%)',      // High contrast
      secondary: 'hsl(0, 0%, 80%)',    // Medium contrast
      tertiary: 'hsl(0, 0%, 60%)',     // Low contrast
      disabled: 'hsl(0, 0%, 40%)',     // Disabled state
      inverse: 'hsl(0, 0%, 10%)',      // For light backgrounds
    },
  },

  // Opacity scale for consistent transparency
  opacity: {
    disabled: 0.4,
    muted: 0.6,
    subtle: 0.8,
    full: 1,
  },

  // Shadow system for elevation
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px 0 rgba(0, 0, 0, 0.4)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.4)',

    // Layered shadows for better depth
    raised: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
    overlay: '0 4px 6px rgba(0,0,0,0.16), 0 2px 4px rgba(0,0,0,0.12)',
    dialog: '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)',
    popup: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
  },

  // Border radius scale
  borderRadius: {
    none: 0,
    sm: 4,
    base: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },

  // Transitions for smooth interactions
  transitions: {
    fast: '150ms ease-out',
    base: '250ms ease-out',
    slow: '350ms ease-out',
    // Specific transitions
    fade: 'opacity 250ms ease-out',
    scale: 'transform 150ms ease-out',
    slide: 'transform 250ms ease-out',
    colors: 'background-color 250ms ease-out, border-color 250ms ease-out, color 250ms ease-out',
  },

  // Breakpoints for responsive design
  breakpoints: {
    xs: 475,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },

  // Z-index scale for layering
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    banner: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    toast: 1600,
    tooltip: 1700,
  },
}

// Utility function to get Tailwind classes for spacing
export const getSpacingClass = (size: keyof typeof theme.spacing) => {
  const sizeMap = {
    xs: 'p-1 gap-1',
    sm: 'p-2 gap-2',
    md: 'p-4 gap-4',
    lg: 'p-6 gap-6',
    xl: 'p-8 gap-8',
    '2xl': 'p-12 gap-12',
    '3xl': 'p-16 gap-16',
    '4xl': 'p-24 gap-24',
  }
  return sizeMap[size] || ''
}

// Utility function to get consistent interactive states
export const getInteractiveClasses = (variant: 'button' | 'card' | 'input' = 'button') => {
  const base = 'transition-all duration-150 ease-out'

  switch (variant) {
    case 'button':
      return `${base} hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0`
    case 'card':
      return `${base} hover:shadow-xl hover:bg-background-highlight cursor-pointer active:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`
    case 'input':
      return `${base} focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-background-base disabled:opacity-40 disabled:cursor-not-allowed`
    default:
      return base
  }
}

// Export type definitions
export type Spacing = keyof typeof theme.spacing
export type Typography = keyof typeof theme.typography.scale
export type Color = keyof typeof theme.colors
export type Shadow = keyof typeof theme.shadows
export type BorderRadius = keyof typeof theme.borderRadius
export type Breakpoint = keyof typeof theme.breakpoints