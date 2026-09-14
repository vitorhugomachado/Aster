'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TableHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';

export interface WatermelonButtonProps extends HTMLMotionProps<'button'> {
  tone?: 'plain' | 'primary' | 'secondary' | 'danger';
}

export const WatermelonButton = forwardRef<HTMLButtonElement, WatermelonButtonProps>(
  function WatermelonButton({ className, tone = 'plain', whileTap, ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        data-watermelon="button"
        className={cn('wm-button', `wm-button-${tone}`, className)}
        whileTap={whileTap ?? { scale: 0.975 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        {...props}
      />
    );
  },
);

export const WatermelonInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function WatermelonInput({ className, ...props }, ref) {
    return <input ref={ref} data-watermelon="input" className={cn('wm-input', className)} {...props} />;
  },
);

export const WatermelonSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function WatermelonSelect({ className, ...props }, ref) {
    return <select ref={ref} data-watermelon="select" className={cn('wm-select', className)} {...props} />;
  },
);

export const WatermelonTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function WatermelonTextarea({ className, ...props }, ref) {
    return <textarea ref={ref} data-watermelon="textarea" className={cn('wm-textarea', className)} {...props} />;
  },
);

export const WatermelonTable = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  function WatermelonTable({ className, ...props }, ref) {
    return <table ref={ref} data-watermelon="table" className={cn('wm-table', className)} {...props} />;
  },
);

export const WatermelonDialog = forwardRef<HTMLElement, HTMLMotionProps<'section'>>(
  function WatermelonDialog({ className, ...props }, ref) {
    return (
      <motion.section
        ref={ref}
        data-watermelon="dialog"
        className={cn('wm-dialog', className)}
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        {...props}
      />
    );
  },
);

export const WatermelonCard = forwardRef<HTMLElement, HTMLMotionProps<'article'>>(
  function WatermelonCard({ className, ...props }, ref) {
    return (
      <motion.article
        ref={ref}
        data-watermelon="card"
        className={cn('wm-card', className)}
        initial={false}
        {...props}
      />
    );
  },
);

export const WatermelonSheet = forwardRef<HTMLElement, HTMLMotionProps<'aside'>>(
  function WatermelonSheet({ className, ...props }, ref) {
    return (
      <motion.aside
        ref={ref}
        data-watermelon="sheet"
        className={cn('wm-sheet', className)}
        initial={{ opacity: 0, x: 12, scale: 0.99 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 8, scale: 0.995 }}
        transition={{ type: 'spring', stiffness: 430, damping: 36 }}
        {...props}
      />
    );
  },
);
