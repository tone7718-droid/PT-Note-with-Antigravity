import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import FaceScale from "@/components/FaceScale"; // 기존 컴포넌트 유지

export function PatientInfoSection({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { register, control, watch, formState: { errors } } = useFormContext<NoteData>();
  const gender = watch("gender");
  const painScore = watch("painScore");

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-base sm:text-lg md:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-3 sm:mb-6 print:text-xl print:mb-3 print:pb-2 print:-mt-2";

  return (
    <Card isPdfMode={isGeneratingPdf}>
      <h2 className={sectionTitleCls}>1. 기본 정보 (Patient Information)</h2>
      <div className={`grid ${isGeneratingPdf ? 'grid-cols-2 gap-4' : 'grid-cols-1 md:grid-cols-2 gap-6 print:gap-4 print:grid-cols-2'}`}>
        <div>
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm sm:text-base text-gray-700 print:text-sm'}`}>
            환자 성명 <span className="text-red-500">*</span>
          </label>
          <Input 
            isPdfMode={isGeneratingPdf}
            placeholder="예: 김철수"
            className={errors.patientName ? "!border-red-400 !ring-red-100" : ""}
            {...register("patientName", { required: "환자 성명을 입력해주세요" })}
          />
        </div>
        <div>
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm sm:text-base text-gray-700 print:text-sm'}`}>차트 번호</label>
          <Input isPdfMode={isGeneratingPdf} placeholder="예: PT-20260318-01" {...register("chartNo")} />
        </div>
        <div>
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm sm:text-base text-gray-700 print:text-sm'}`}>생년월일</label>
          <Input type="date" isPdfMode={isGeneratingPdf} {...register("birthDate")} />
        </div>

        {/* 성별 선택 */}
        <div className={isGeneratingPdf ? "hidden" : "print:hidden"}>
          <label className="block text-sm sm:text-base font-bold text-gray-700 mb-2">성별</label>
          <div className="flex items-center space-x-8 mt-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <label className="flex items-center cursor-pointer group">
              <input type="radio" value="M" className="w-5 h-5 text-gray-900" {...register("gender")} />
              <span className="ml-3 font-semibold text-gray-800 group-hover:text-gray-900">남성 (M)</span>
            </label>
            <label className="flex items-center cursor-pointer group">
              <input type="radio" value="F" className="w-5 h-5 text-gray-900" {...register("gender")} />
              <span className="ml-3 font-semibold text-gray-800 group-hover:text-gray-900">여성 (F)</span>
            </label>
          </div>
        </div>
        
        {/* PDF 용 성별 */}
        <div className={isGeneratingPdf ? "block" : "hidden print:block"}>
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm text-gray-700'}`}>성별</label>
          <div className={`${isGeneratingPdf ? 'py-1 text-base font-medium border-b border-gray-300' : 'p-2 text-base font-medium'}`}>
            {gender === "M" ? "남성 (M)" : gender === "F" ? "여성 (F)" : ""}
          </div>
        </div>

        <div className="col-span-1 md:col-span-2">
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm sm:text-base text-gray-700 print:text-sm'}`}>
            진단명 <span className="text-red-500">*</span>
          </label>
          <Input 
            isPdfMode={isGeneratingPdf} 
            placeholder="예: 요추 추간판 탈출증"
            className={errors.diagnosis ? "!border-red-400 !ring-red-100" : ""}
            {...register("diagnosis", { required: "진단명을 입력해주세요" })} 
          />
        </div>
        <div className="col-span-1 md:col-span-2">
          <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm sm:text-base text-gray-700 print:text-sm'}`}>과거력 (PMH)</label>
          <Input isPdfMode={isGeneratingPdf} placeholder="고혈압, 당뇨 등 기재" {...register("pmh")} />
        </div>
      </div>
      
      {/* 통증 점수 */}
      <div className={`${isGeneratingPdf ? 'hidden' : 'mt-8 bg-gray-50 p-6 rounded-3xl border border-gray-100 print:hidden'}`}>
        <Controller
          name="painScore"
          control={control}
          render={({ field }) => (
            <FaceScale value={field.value} onChange={field.onChange} />
          )}
        />
      </div>
      <div className={`${isGeneratingPdf ? 'block mt-4' : 'hidden print:block mt-4'}`}>
        <label className={`block font-bold mb-2 ${isGeneratingPdf ? 'text-sm text-black mb-1' : 'text-sm text-gray-700'}`}>통증 점수 (NRS)</label>
        <div className={`${isGeneratingPdf ? 'py-1 text-base font-medium border-b border-gray-300 w-1/4' : 'p-2 text-base font-medium'}`}>
          {painScore !== null ? `${painScore} / 10` : "기록 안 됨"}
        </div>
      </div>
    </Card>
  );
}
