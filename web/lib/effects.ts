/**
 * Glow Effect Utilities for Lifeguard Token Vault
 * Crypto-modern UI with performance-optimized neon aesthetics
 */

export type GlowIntensity = 'sm' | 'md' | 'lg' | 'xl';

export interface GlowConfig {
  color: string;
  intensity: GlowIntensity;
}

export interface PulseConfig {
  duration: number;
  color: string;
  minIntensity?: number;
  maxIntensity?: number;
}

export interface NeonBorderConfig {
  color: string;
  width: number;
  intensity?: GlowIntensity;
}

export interface GlassmorphismConfig {
  opacity: number;
  blur: number;
  borderOpacity?: number;
}

export interface GradientGlowConfig {
  colors: string[];
  intensity?: GlowIntensity;
  angle?: number;
}

/**
 * Glow intensity multipliers for consistent scaling
 */
const GLOW_MULTIPLIERS: Record<GlowIntensity, number> = {
  sm: 0.5,
  md: 1,
  lg: 2,
  xl: 4
};

/**
 * Base blur values for different glow intensities
 */
const BASE_BLUR_VALUES: Record<GlowIntensity, number> = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24
};

/**
 * Creates a glow effect using multiple box-shadows for depth
 * Optimized for hardware acceleration
 */
export function createGlowEffect(color: string, intensity: GlowIntensity = 'md'): string {
  const multiplier = GLOW_MULTIPLIERS[intensity];
  const baseBlur = BASE_BLUR_VALUES[intensity];

  // Create layered shadows for realistic glow depth
  const innerGlow = `inset 0 0 ${baseBlur * 0.5}px ${color}40`;
  const middleGlow = `0 0 ${baseBlur}px ${color}60`;
  const outerGlow = `0 0 ${baseBlur * 2}px ${color}30`;
  const farGlow = intensity !== 'sm' ? `, 0 0 ${baseBlur * 4}px ${color}20` : '';

  return `${innerGlow}, ${middleGlow}, ${outerGlow}${farGlow}`;
}

/**
 * Creates optimized text glow using text-shadow
 * Hardware-accelerated and layout-friendly
 */
export function createTextGlow(color: string, intensity: GlowIntensity = 'md'): string {
  const multiplier = GLOW_MULTIPLIERS[intensity];
  const baseBlur = BASE_BLUR_VALUES[intensity] * 0.75; // Slightly tighter for text

  // Layered text shadows for readable glow
  const closeGlow = `0 0 ${baseBlur * 0.5}px ${color}80`;
  const mediumGlow = `0 0 ${baseBlur}px ${color}60`;
  const farGlow = `0 0 ${baseBlur * 2}px ${color}40`;
  const ambientGlow = intensity !== 'sm' ? `, 0 0 ${baseBlur * 3}px ${color}20` : '';

  return `${closeGlow}, ${mediumGlow}, ${farGlow}${ambientGlow}`;
}

/**
 * Creates CSS keyframes and animation for pulsing glow effect
 * Uses opacity and filter for hardware acceleration
 */
export function createPulseAnimation(
  duration: number,
  color: string,
  minIntensity: number = 0.3,
  maxIntensity: number = 1
): { keyframes: string; animation: string; className: string } {
  const animationName = `pulse-glow-${Math.random().toString(36).substr(2, 9)}`;

  const keyframes = `
    @keyframes ${animationName} {
      0%, 100% {
        opacity: ${minIntensity};
        filter: brightness(${minIntensity});
      }
      50% {
        opacity: ${maxIntensity};
        filter: brightness(${maxIntensity});
      }
    }
  `;

  const animation = `${animationName} ${duration}ms ease-in-out infinite`;

  return {
    keyframes,
    animation,
    className: animationName
  };
}

/**
 * Creates neon border effect with optional glow
 * Combines border and box-shadow for authentic neon look
 */
export function createNeonBorder(config: NeonBorderConfig): string {
  const { color, width, intensity = 'md' } = config;
  const glowEffect = createGlowEffect(color, intensity);

  return `
    border: ${width}px solid ${color};
    box-shadow: ${glowEffect};
  `;
}

/**
 * Creates glassmorphism effect with backdrop blur and transparency
 * Optimized for modern browsers with backdrop-filter support
 */
export function createGlassmorphism(config: GlassmorphismConfig): string {
  const { opacity, blur, borderOpacity = 0.2 } = config;

  return `
    background: rgba(255, 255, 255, ${opacity});
    backdrop-filter: blur(${blur}px);
    -webkit-backdrop-filter: blur(${blur}px);
    border: 1px solid rgba(255, 255, 255, ${borderOpacity});
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  `;
}

/**
 * Creates multi-color gradient glow effect
 * Uses conic-gradient for smooth color transitions
 */
export function createGradientGlow(config: GradientGlowConfig): string {
  const { colors, intensity = 'md', angle = 45 } = config;
  const baseBlur = BASE_BLUR_VALUES[intensity];

  // Create gradient string
  const gradientStops = colors.map((color, index) => {
    const position = (index / (colors.length - 1)) * 100;
    return `${color} ${position}%`;
  }).join(', ');

  const gradient = `linear-gradient(${angle}deg, ${gradientStops})`;

  // Create glow layers for each color
  const glowLayers = colors.map(color =>
    `0 0 ${baseBlur}px ${color}40`
  ).join(', ');

  return `
    background: ${gradient};
    box-shadow: ${glowLayers};
  `;
}

/**
 * Utility functions for dynamic theming with CSS variables
 */
export const glowVariables = {
  /**
   * Sets CSS variables for dynamic glow theming
   */
  setCSSVariables: (element: HTMLElement, config: Record<string, string>) => {
    Object.entries(config).forEach(([key, value]) => {
      element.style.setProperty(`--glow-${key}`, value);
    });
  },

  /**
   * Creates CSS variable-based glow effect for theming
   */
  createThemeableGlow: (intensity: GlowIntensity = 'md') => {
    const baseBlur = BASE_BLUR_VALUES[intensity];
    return `
      box-shadow:
        inset 0 0 ${baseBlur * 0.5}px var(--glow-color, #00ff88),
        0 0 ${baseBlur}px var(--glow-color, #00ff88),
        0 0 ${baseBlur * 2}px var(--glow-color, #00ff88);
    `;
  }
};

/**
 * Pre-defined crypto/neon color palette for consistent theming
 */
export const cryptoColors = {
  // Primary neon colors
  neonGreen: '#00ff88',
  neonBlue: '#00d4ff',
  neonPurple: '#8b5cf6',
  neonPink: '#f472b6',
  neonOrange: '#fb923c',

  // Crypto-themed colors
  bitcoin: '#f7931a',
  ethereum: '#627eea',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',

  // Neutral glows
  white: '#ffffff',
  silver: '#c0c0c0',
  gold: '#ffd700'
};

/**
 * Pre-configured effect presets for common use cases
 */
export const effectPresets = {
  // Button effects
  primaryButton: () => ({
    background: 'rgba(0, 255, 136, 0.1)',
    ...parseCSS(createGlowEffect(cryptoColors.neonGreen, 'md')),
    ...parseCSS(createNeonBorder({ color: cryptoColors.neonGreen, width: 1, intensity: 'sm' }))
  }),

  // Card effects
  glassCard: () => ({
    ...parseCSS(createGlassmorphism({ opacity: 0.05, blur: 10, borderOpacity: 0.1 })),
    ...parseCSS(createGlowEffect(cryptoColors.neonBlue, 'sm'))
  }),

  // Text effects
  heroText: () => ({
    color: cryptoColors.neonGreen,
    textShadow: createTextGlow(cryptoColors.neonGreen, 'lg')
  }),

  // Status effects
  successGlow: () => ({
    ...parseCSS(createGlowEffect(cryptoColors.success, 'md'))
  }),

  warningGlow: () => ({
    ...parseCSS(createGlowEffect(cryptoColors.warning, 'md'))
  }),

  dangerGlow: () => ({
    ...parseCSS(createGlowEffect(cryptoColors.danger, 'md'))
  })
};

/**
 * Helper function to parse CSS strings into objects
 * Used by presets for easy React/CSS-in-JS integration
 */
function parseCSS(cssString: string): Record<string, string> {
  const result: Record<string, string> = {};
  const rules = cssString.split(';').filter(rule => rule.trim());

  rules.forEach(rule => {
    const [property, value] = rule.split(':').map(s => s.trim());
    if (property && value) {
      // Convert kebab-case to camelCase for CSS-in-JS
      const camelProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelProperty] = value;
    }
  });

  return result;
}

/**
 * Performance utilities for animation optimization
 */
export const animationUtils = {
  /**
   * Creates will-change CSS for hardware acceleration
   */
  enableHardwareAcceleration: () => ({
    willChange: 'transform, opacity, filter',
    transform: 'translateZ(0)' // Force hardware layer
  }),

  /**
   * Disables hardware acceleration when animation ends
   */
  disableHardwareAcceleration: () => ({
    willChange: 'auto',
    transform: 'none'
  }),

  /**
   * Optimized CSS for smooth animations
   */
  smoothAnimation: (duration: number = 300) => ({
    transition: `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    ...animationUtils.enableHardwareAcceleration()
  })
};

export default {
  createGlowEffect,
  createTextGlow,
  createPulseAnimation,
  createNeonBorder,
  createGlassmorphism,
  createGradientGlow,
  glowVariables,
  cryptoColors,
  effectPresets,
  animationUtils
};