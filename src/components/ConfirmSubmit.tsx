"use client";

/** Submit button that asks for confirmation before a destructive server action. */
export function ConfirmSubmit({
  message,
  children,
  className,
  ...rest
}: { message: string; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
