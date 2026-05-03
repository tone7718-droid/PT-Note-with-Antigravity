import * as React from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isPdfMode?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, isPdfMode, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          isPdfMode
            ? "w-full py-1 text-base text-black bg-transparent border-0 border-b border-gray-300 font-medium"
            : "w-full p-3 sm:p-4 text-sm sm:text-base md:text-lg border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-colors text-gray-900 bg-white min-h-[2.75rem] sm:min-h-[3.5rem] placeholder:text-gray-400 shadow-sm print:shadow-none print:border-gray-300 print:text-base print:p-2 print:min-h-0 print:bg-transparent",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
