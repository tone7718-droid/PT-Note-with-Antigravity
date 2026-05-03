import * as React from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isPdfMode?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isPdfMode, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          isPdfMode
            ? "w-full py-1 text-base text-black bg-transparent border-0 border-b border-gray-300 font-medium leading-relaxed min-h-[4rem] resize-none overflow-hidden"
            : "w-full p-3 sm:p-4 text-sm sm:text-base md:text-lg border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-colors text-gray-900 bg-white min-h-[5rem] sm:min-h-[7rem] placeholder:text-gray-400 leading-relaxed shadow-sm overflow-hidden resize-none print:shadow-none print:border-gray-300 print:text-base print:p-2 print:min-h-[5rem] print:bg-transparent",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
