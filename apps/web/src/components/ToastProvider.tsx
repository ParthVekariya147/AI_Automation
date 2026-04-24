import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastTone = "success" | "error" | "info";

type ToastInput = {
    title: string;
    description?: string;
    tone?: ToastTone;
    durationMs?: number;
};

type ToastItem = ToastInput & {
    id: string;
    tone: ToastTone;
};

const ToastContext = createContext<((input: ToastInput) => void) | undefined>(undefined);

function createToastId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timersRef = useRef<Record<string, number>>({});

    const removeToast = useCallback((toastId: string) => {
        setToasts((current) => current.filter((toast) => toast.id !== toastId));

        const timer = timersRef.current[toastId];
        if (timer) {
            window.clearTimeout(timer);
            delete timersRef.current[toastId];
        }
    }, []);

    const pushToast = useCallback(
        (input: ToastInput) => {
            const id = createToastId();
            const tone = input.tone || "info";
            const timeoutMs = input.durationMs ?? (tone === "error" ? 5200 : 3600);

            setToasts((current) => [...current, { ...input, id, tone }]);

            timersRef.current[id] = window.setTimeout(() => {
                removeToast(id);
            }, timeoutMs);
        },
        [removeToast]
    );

    useEffect(() => {
        return () => {
            Object.values(timersRef.current).forEach((timer) => {
                window.clearTimeout(timer);
            });
            timersRef.current = {};
        };
    }, []);

    const contextValue = useMemo(() => pushToast, [pushToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,400px)] flex-col gap-2">
                {toasts.map((toast) => {
                    const toneClass =
                        toast.tone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : toast.tone === "error"
                                ? "border-red-200 bg-red-50 text-red-900"
                                : "border-slate-200 bg-white text-slate-900";

                    return (
                        <div
                            key={toast.id}
                            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.12)] ${toneClass}`}
                            role="status"
                            aria-live={toast.tone === "error" ? "assertive" : "polite"}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold">{toast.title}</p>
                                    {toast.description ? (
                                        <p className="mt-1 text-xs leading-5 opacity-90">{toast.description}</p>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeToast(toast.id)}
                                    className="rounded-full px-2 py-1 text-xs font-medium opacity-80 transition hover:opacity-100"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error("useToast must be used within ToastProvider");
    }

    return context;
}
