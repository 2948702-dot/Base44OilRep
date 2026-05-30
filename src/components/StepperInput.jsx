import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function StepperInput({ 
  value = 0, 
  onChange, 
  min = 0, 
  max = 1000, 
  step = 1, 
  label,
  className 
}) {
  const handleUp = () => {
    const newVal = Math.min(Number(value) + step, max);
    onChange(newVal);
  };

  const handleDown = () => {
    const newVal = Math.max(Number(value) - step, min);
    onChange(newVal);
  };

  const handleInputChange = (e) => {
    let val = parseFloat(e.target.value) || 0;
    val = Math.max(min, Math.min(max, val));
    onChange(val);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={handleDown}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          value={value}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          className="text-center"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={handleUp}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}