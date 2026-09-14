"use client";

import { useState, useEffect, useId, type FC } from "react";
import { motion, LayoutGroup } from "motion/react";

/* ---------- Types ---------- */
interface TabItem {
    id: string;
    label: string;
}

interface ContinuousTabsProps {
    tabs?: TabItem[];
    activeId?: string;
    defaultActiveId?: string;
    onChange?: (id: string) => void;
    className?: string;
    compact?: boolean;
}

/* ---------- Defaults ---------- */
const DEFAULT_TABS: TabItem[] = [
    { id: "home", label: "Home" },
    { id: "interactions", label: "Interactions" },
    { id: "resources", label: "Resources" },
    { id: "docs", label: "Docs" },
];

export const ContinuousTabs: FC<ContinuousTabsProps> = ({
    tabs = DEFAULT_TABS,
    activeId,
    defaultActiveId = "home",
    onChange,
    className = "",
    compact = false,
}) => {
    const [internalActive, setInternalActive] = useState<string>(defaultActiveId);
    const [isMounted, setIsMounted] = useState<boolean>(false);
    const layoutId = useId();
    const active = activeId ?? internalActive;

    useEffect(() => {
        requestAnimationFrame(() => setIsMounted(true));
    }, []);

    const handleChange = (id: string) => {
        if (activeId === undefined) setInternalActive(id);
        onChange?.(id);
    };

    if (!isMounted) return null;

    return (
        <LayoutGroup>
            <nav
                data-watermelon="continuous-tabs"
                className={`
          relative flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5
            rounded-full
            border border-[var(--border)]
            bg-linear-to-b from-[var(--surface)] to-[var(--surface-subtle)]
            shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08),
                    inset_0_1px_0_rgba(255,255,255,0.9),
                    0_4px_12px_rgba(0,0,0,0.03)]
            transition-all duration-300
            ${className}`}
            >
                {tabs.map((tab) => {
                    const isActive = active === tab.id;

                    return (
                        <button
                            type="button"
                            key={tab.id}
                            onClick={() => handleChange(tab.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`relative rounded-full outline-none ${compact ? 'px-3 py-1.5' : 'px-4 py-2 sm:px-6 sm:py-3'}`}
                        >
                            {/* Active pill */}
                            {isActive && (
                                <motion.div
                                    layoutId={`active-pill-${layoutId}`}
                                    transition={{
                                        type: "spring",
                                        stiffness: 380,
                                        damping: 30,
                                        mass: 0.9,
                                    }}
                                    className="
                      absolute inset-0 rounded-full
                      bg-[var(--foreground)]
                      shadow-xs
                    "
                                />
                            )}

                            {/* Text */}
                            <motion.span
                                layout="position"
                                className={`relative z-10 font-semibold transition-colors duration-200 ${compact ? 'text-xs' : 'text-sm sm:text-base'}
                    ${isActive
                                        ? "text-[var(--surface)]"
                                        : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                                    }
                  `}
                            >
                                {tab.label}
                            </motion.span>
                        </button>
                    );
                })}
            </nav>
        </LayoutGroup>
    );
};
