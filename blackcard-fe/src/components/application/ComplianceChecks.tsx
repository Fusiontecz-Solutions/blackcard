import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import MyNotes from "./MyNotes";
import { useTheme } from "@/context/ThemeContext";
import ComplianceChecksQuestionnaire, {
    type ComplianceChecksProgress,
} from "./ComplianceChecksQuestionnaire";

const ComplianceChecks = () => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
    const applicationId = applicationData?._id;

    const [progress, setProgress] = useState<ComplianceChecksProgress>({
        completed: 0,
        total: 6,
        flagsRaised: 0,
        allComplete: false,
    });

    const progressPercentage =
        progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0;

    const getOverallRisk = () => {
        if (progress.completed === 0) {
            return { level: "Not Assessed", color: "text-gray-500" };
        }
        const noAnswers = progress.completed - progress.flagsRaised;
        if (progress.flagsRaised > noAnswers) {
            return { level: "High Risk", color: "text-red-600" };
        }
        if (progress.flagsRaised === noAnswers) {
            return { level: "Medium Risk", color: "text-yellow-600" };
        }
        return { level: "Low Risk", color: "text-green-600" };
    };

    const overallRisk = getOverallRisk();

    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Compliance Checks Progress Section */}
            <Card className="gap-2 w-full border border-[#FDFDFD] shadow-[0px_4px_20px_0px_#00000005] rounded-sm px-6 py-4">
                <div className="flex items-center justify-between">
                    <h3 className={`text-base font-[600] font-roboto text-[#374151] ${isDark ? 'text-gray-200' : 'text-[#374151]'}`}>Compliance Checks Progress</h3>
                    <span className={`font-[600] font-roboto text-[#374151] ${isDark ? 'text-gray-200' : 'text-[#374151]'}`}>{progressPercentage}%</span>
                </div>
                
                {/* Progress Bar */}
                <div className="relative w-full">
                    <div className={`w-full ${isDark ? 'bg-muted' : 'bg-[#E9EDF5]'} rounded-full h-2.5`}>
                        <div 
                            className="h-full bg-[image:var(--brand-gradient)] rounded-full transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                        ></div>
                    </div>
                </div>
                
                {/* Details below Progress Bar */}
                <div className="flex items-center justify-between">
                    <p className={`text-xs font-[400] font-roboto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {progress.completed} of {progress.total} checks completed
                    </p>
                    <p className="text-xs font-medium text-[#F55641]">
                        {progress.flagsRaised} Flag{progress.flagsRaised !== 1 ? "s" : ""} Raised
                    </p>
                </div>
            </Card>

            <div className="flex gap-6 w-full">
                <Card className={`bg-transparent w-[85%] flex-2 shadow-none border-none py-0 px-0 ${isDark ? "bg-transparent" : ""}`}>
                    <ComplianceChecksQuestionnaire
                        applicationId={applicationId}
                        showProgress={false}
                        onProgressChange={setProgress}
                    />
                </Card>
                
                <div className="flex flex-col gap-6 flex-1 w-full">
                    <MyNotes/>
                    
                    {/* Risk Summary Card */}
                    <Card className={` border border-[#FDFDFD] shadow-[0px_4px_20px_0px_#00000005] rounded-sm ${isDark ? 'bg-card' : 'bg-white'} overflow-hidden pt-0 pb-2 gap-2 px-0`}>
                        {/* Header Section */}
                        <div className={`${isDark ? 'bg-muted' : 'bg-[#F9FAFD]'} px-4 py-3`}>
                            <h3 className={`text-base font-roboto font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Risk Summery</h3>
                        </div>
                        
                        {/* Main Content */}
                        <div className="px-0 py-2 space-y-4">
                            {/* Overall Risk */}
                            <div className="flex justify-between items-center px-4">
                                <span className={`text-sm font-roboto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Overall Risk</span>
                                <span className={`text-sm font-roboto font-medium ${overallRisk.color}`}>{overallRisk.level}</span>
                            </div>
                            
                            {/* Credit Score */}
                            <div className="flex justify-between items-center px-4">
                                <span className={`text-sm font-roboto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Credit Score</span>
                                <span className="text-sm font-roboto font-medium text-green-600">720 - Excellent</span>
                            </div>
                            
                            {/* Risk Grade */}
                            <div className="flex justify-between items-center px-4">
                                <span className={`text-sm font-roboto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Risk Grade</span>
                                <span className="text-sm font-roboto font-medium text-green-600">B+</span>
                            </div>
                            
                            {/* Separator */}
                            <div className={`border-t ${isDark ? 'border-[#363638]' : 'border-[#D1D5DB]'} my-4`}></div>
                            
                            {/* Flag Section */}
                            <div className="px-4">
                                <span className="text-sm font-roboto font-bold text-red-600">
                                    {progress.flagsRaised} Flag
                                    {progress.flagsRaised !== 1 ? "s" : ""}
                                </span>
                                  <p className={`text-sm font-roboto ${isDark ? 'text-gray-300' : 'text-gray-700'} mt-1`}>Tax returns 
                                  pending CPA signature</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ComplianceChecks;

