import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import BodyDiagram from "@/components/BodyDiagram";

export function BodyDiagramSection({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { control, watch } = useFormContext<NoteData>();
  const painAreas = watch("painAreas") || {};

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-base sm:text-lg md:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-3 sm:mb-6 print:text-xl print:mb-3 print:pb-2 print:-mt-2";

  return (
    <Card isPdfMode={isGeneratingPdf}>
      <h2 className={sectionTitleCls}>3. 인체 통증 부위 (Pain Areas)</h2>
      <div className={`${isGeneratingPdf ? 'hidden' : 'print:hidden flex justify-center w-full'}`}>
        <Controller
          name="painAreas"
          control={control}
          render={({ field }) => (
            <BodyDiagram painAreas={field.value || {}} setPainAreas={field.onChange} />
          )}
        />
      </div>
      {/* PDF 및 인쇄 모드에선 텍스트 표출 */}
      <div className={`${isGeneratingPdf ? 'block' : 'hidden print:block mt-2'}`}>
        {Object.keys(painAreas).length > 0 ? (
          <div className={`${isGeneratingPdf ? 'py-2 font-medium text-black' : 'p-3 border-2 border-gray-300 rounded-xl bg-gray-50 font-bold text-gray-800 text-base'}`}>
            {Object.entries(painAreas)
              .sort((a, b) => b[1] - a[1])
              .map(([name, level]) => `${name}(${level === 1 ? '경도' : level === 2 ? '중등도' : '중증'})`)
              .join(", ")}
          </div>
        ) : (
          <div className={`${isGeneratingPdf ? 'py-2 text-gray-500' : 'p-3 text-gray-500 italic text-sm'}`}>선택된 부위가 없습니다.</div>
        )}
      </div>
    </Card>
  );
}
