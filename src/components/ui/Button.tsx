import * as React from "react";
import { cn } from "@/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    // Basic dynamic tailwind button system (simplified cva)
    const baseStyles = "inline-flex items-center justify-center font-bold transition-all focus:outline-none focus:ring-4 disabled:opacity-50 disabled:pointer-events-none transform active:scale-95";
    
    const variants = {
      primary: "bg-gray-900 hover:bg-gray-800 text-white shadow-lg hover:shadow-xl focus:ring-gray-900/50",
      secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700 focus:ring-gray-300",
      danger: "bg-red-600 hover:bg-red-700 text-white shadow-lg focus:ring-red-500/50",
      outline: "border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-100 text-gray-700 focus:ring-gray-900/30",
      ghost: "hover:bg-gray-100 text-gray-600",
    };
    
    const sizes = {
      sm: "px-4 py-2 text-sm rounded-xl",
      md: "px-6 py-3.5 text-base rounded-2xl",
      lg: "px-8 py-4 text-lg rounded-2xl",
      icon: "p-2 rounded-xl",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
