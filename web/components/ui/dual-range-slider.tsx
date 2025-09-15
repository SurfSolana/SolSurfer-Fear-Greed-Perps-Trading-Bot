'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';

interface DualRangeSliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root> {
  labelPosition?: 'top' | 'bottom';
  label?: boolean;
  lowLabel?: string;
  highLabel?: string;
}

const DualRangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  DualRangeSliderProps
>(
  (
    {
      className,
      label = true,
      labelPosition = 'top',
      lowLabel = 'Low',
      highLabel = 'High',
      ...props
    },
    ref
  ) => {
    const initialValue = Array.isArray(props.value)
      ? props.value
      : [props.min ?? 0, props.max ?? 100];

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track className='relative h-2 w-full grow overflow-hidden rounded-full bg-muted'>
          <SliderPrimitive.Range className='absolute h-full bg-primary' />
        </SliderPrimitive.Track>
        {initialValue.map((value, index) => (
          <React.Fragment key={index}>
            <SliderPrimitive.Thumb
              className='relative block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
            >
              {label && (
                <span
                  className={cn(
                    'absolute flex items-center justify-center gap-1',
                    labelPosition === 'top' && '-top-8 left-1/2 -translate-x-1/2',
                    labelPosition === 'bottom' && 'top-6 left-1/2 -translate-x-1/2'
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {index === 0 ? lowLabel : highLabel}:
                  </span>
                  <NumberFlow
                    value={value}
                    className="text-sm font-mono font-bold text-foreground"
                    format={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
                  />
                </span>
              )}
            </SliderPrimitive.Thumb>
          </React.Fragment>
        ))}
      </SliderPrimitive.Root>
    );
  }
);

DualRangeSlider.displayName = SliderPrimitive.Root.displayName;

export { DualRangeSlider };