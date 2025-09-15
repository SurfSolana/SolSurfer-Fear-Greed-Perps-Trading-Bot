'use client';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';
import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

type Props = {
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  suffix?: string;
};

export function NumberInput({
  value = 0,
  min = -Infinity,
  max = Infinity,
  onChange,
  className,
  size = 'md',
  suffix,
}: Props) {
  const defaultValue = React.useRef(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [animated, setAnimated] = React.useState(true);
  // Hide the caret during transitions so you can't see it shifting around:
  const [showCaret, setShowCaret] = React.useState(true);

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
    xl: 'text-6xl',
  };

  const iconSizes = {
    sm: 'size-3',
    md: 'size-4',
    lg: 'size-5',
    xl: 'size-6',
  };

  const handleInput: React.ChangeEventHandler<HTMLInputElement> = ({
    currentTarget: el,
  }) => {
    setAnimated(false);
    if (el.value === '') {
      onChange?.(defaultValue.current);
      return;
    }
    const num = parseInt(el.value);
    if (
      isNaN(num) ||
      (min != null && num < min) ||
      (max != null && num > max)
    ) {
      // Revert input's value:
      el.value = String(value);
    } else {
      // Manually update value in case they e.g. start with a "0" or end with a "."
      // which won't trigger a DOM update (because the number is the same):
      el.value = String(num);
      onChange?.(num);
    }
  };

  const handlePointerDown =
    (diff: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      setAnimated(true);
      if (event.pointerType === 'mouse') {
        event?.preventDefault();
        inputRef.current?.focus();
      }
      const newVal = Math.min(Math.max(value + diff, min), max);
      onChange?.(newVal);
    };

  return (
    <div className={cn(
      'group flex items-stretch rounded-md font-semibold border w-fit mx-auto bg-background',
      sizeClasses[size],
      className
    )}>
      <button
        aria-hidden
        tabIndex={-1}
        className='flex items-center pl-[.5em] pr-[.325em] hover:bg-muted/50 transition-colors'
        disabled={min != null && value <= min}
        onPointerDown={handlePointerDown(-1)}
      >
        <Minus className={cn(iconSizes[size], 'text-muted-foreground')} absoluteStrokeWidth strokeWidth={3.5} />
      </button>
      <div className="relative grid items-center justify-items-center text-center [grid-template-areas:'overlap'] *:[grid-area:overlap]">
        <input
          ref={inputRef}
          className={cn(
            showCaret ? 'caret-primary' : 'caret-transparent',
            'w-[2em] bg-transparent py-2 text-center font-[inherit] text-transparent outline-none appearance-none',
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
          )}
          // Make sure to disable kerning, to match NumberFlow:
          style={{ fontKerning: 'none' }}
          type='number'
          min={min}
          step={1}
          autoComplete='off'
          inputMode='numeric'
          max={max}
          value={value}
          onInput={handleInput}
        />
        <NumberFlow
          value={value}
          format={{ useGrouping: false }}
          suffix={suffix}
          aria-hidden
          animated={animated}
          onAnimationsStart={() => setShowCaret(false)}
          onAnimationsFinish={() => setShowCaret(true)}
          className='pointer-events-none'
          willChange
        />
      </div>
      <button
        aria-hidden
        tabIndex={-1}
        className='flex items-center pl-[.325em] pr-[.5em] hover:bg-muted/50 transition-colors'
        disabled={max != null && value >= max}
        onPointerDown={handlePointerDown(1)}
      >
        <Plus className={cn(iconSizes[size], 'text-muted-foreground')} absoluteStrokeWidth strokeWidth={3.5} />
      </button>
    </div>
  );
}