"use client";

import { cn } from "@/lib/utils";
import { useId, useState } from "react";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FloatingInput({ label, className, ...props }: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(Boolean(props.defaultValue));
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const hasValue = props.value !== undefined ? String(props.value).length > 0 : uncontrolledHasValue;

  return (
    <div className="relative">
      <input
        {...props}
        id={inputId}
        data-watermelon="floating-input"
        className={cn(
          "peer h-12 w-full rounded-xl border bg-white px-4 pt-3 text-sm outline-none",
          "border-border focus:border-primary transition-all duration-200",
          className
        )}
        placeholder=" "
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(e) => {
          setFocused(false);
          setUncontrolledHasValue(e.target.value !== "");
          props.onBlur?.(e);
        }}
        onChange={(e) => {
          setUncontrolledHasValue(e.target.value !== "");
          props.onChange?.(e);
        }}
      />
      <label
        htmlFor={inputId}
        className={cn(
          "pointer-events-none absolute left-4 top-3.5 text-sm text-muted-foreground transition-all duration-200",
          "peer-focus:top-1.5 peer-focus:left-4 peer-focus:text-[10px]",
          "peer-focus:text-primary",
          (focused || hasValue) && "top-1.5 left-4 text-[10px]"
        )}
      >
        {label}
      </label>
    </div>
  );
}
