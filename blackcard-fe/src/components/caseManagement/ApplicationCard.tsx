import { useTheme } from '@/context/ThemeContext';
import { Card } from '@/components/ui/card';
import { BarChart3, Calendar } from 'lucide-react';
import type { Application } from '@/types/applicationTypes';
import { useState, useRef } from 'react';
import { formatCurrency } from "@/lib/utils";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";

interface ApplicationCardProps {
    application: Application;
    onClick: () => void;
}

const ApplicationCard = ({ application, onClick }: ApplicationCardProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPosition = useRef<{ x: number; y: number } | null>(null);

    // Get business name
    const businessName = typeof application.client === 'object'
        ? application.client?.business?.name || 'N/A'
        : 'N/A';

    // Get client name (for display below amount)
    const clientName = typeof application.client === 'object'
        ? application.client?.business?.name || 
          `${application.client?.owner?.firstName || ''} ${application.client?.owner?.lastName || ''}`.trim() || 'N/A'
        : 'N/A';

    // Get owner name for avatar
    const ownerName = typeof application.client === 'object'
        ? `${application.client?.owner?.firstName || ''} ${application.client?.owner?.lastName || ''}`.trim()
        : '';
    
    const initials = ownerName
        ? ownerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'NA';

    // Format loan number
    const loanNumber = application.applicationId
        ? `LN-2024-${String(application.applicationId).padStart(3, '0')}`
        : 'N/A';

    // Format amount: prefer OfferDecision offer, then requested loanAmount
    const rawAmount = resolveApplicationDisplayLoanAmount(application);

    const amount =
        rawAmount == null || Number.isNaN(rawAmount)
            ? "-"
            : formatCurrency(rawAmount);

    // Get priority
    const priority = application.priority || 'Medium';

    // Get due date (using createdAt as placeholder, format as YYYY-MM-DD)
    const dueDate = application.createdAt
        ? new Date(application.createdAt).toISOString().split('T')[0]
        : '';

    // Priority text (matching screenshot - just text, no badge)
    const getPriorityText = (priority: string) => {
        switch (priority) {
            case 'High':
            case 'Urgent':
                return 'High Priority';
            case 'Medium':
                return 'Medium Priority';
            case 'Low':
                return 'Low Priority';
            default:
                return 'Medium Priority';
        }
    };

    // Avatar color based on status/column (simplified)
    const getAvatarColor = () => {
        // You can customize this based on your needs
        return isDark ? 'bg-blue-500' : 'bg-blue-500';
    };

    const handleDragStart = (e: React.DragEvent) => {
        setIsDragging(true);
        dragStartPosition.current = { x: e.clientX, y: e.clientY };
        e.dataTransfer.effectAllowed = 'move';
        const dragId = String(
            application._id ?? (application as Application & { id?: string }).id ?? '',
        );
        e.dataTransfer.setData('applicationId', dragId);
        e.dataTransfer.setData('text/plain', dragId);
        // Make the card semi-transparent while dragging
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.5';
        }
        // Prevent click event from firing after drag
        e.stopPropagation();
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setIsDragging(false);
        // Reset opacity
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1';
        }
        // Clear drag position immediately
        dragStartPosition.current = null;
        e.stopPropagation();
    };

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't trigger onClick if it was a drag operation
        if (!isDragging && !dragStartPosition.current) {
            onClick();
        }
    };

    return (
        <Card
            draggable={true}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => {
                // Allow dragging over cards - let parent column handle the drop
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // Don't stop propagation so parent can handle drop
            }}
            className={`cursor-pointer hover:shadow-md transition-all select-none ${isDark ? 'bg-card border-gray-700' : 'bg-white border-gray-200'}`}
            onClick={handleCardClick}
            style={{ userSelect: 'none' }}
        >
            <div className="p-4">
                {/* Top Section: Business Name, Loan Number, and Avatar */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                        {/* Business Name - Large, bold, dark gray */}
                        <h4 className={`text-base font-bold mb-1 truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {businessName}
                        </h4>
                        {/* Loan Number - Smaller, lighter gray */}
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {loanNumber}
                        </span>
                    </div>
                    {/* Avatar - Top right corner */}
                    <div className={`w-8 h-8 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
                        {initials}
                    </div>
                </div>

                {/* Amount Section - Large, bold */}
                <div className="mb-2">
                    <span className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {amount}
                    </span>
                    {/* Client Name below amount - Smaller, lighter gray */}
                    <div className="mt-1">
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {clientName}
                        </span>
                    </div>
                </div>

                {/* Priority - Bold text */}
                <div className="mb-3">
                    <span className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {getPriorityText(priority)}
                    </span>
                </div>

                {/* Bottom Section: Due Date and Score */}
                <div className={`flex items-center justify-between pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-1.5">
                        <Calendar className={`h-3.5 w-3.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Due: {dueDate || 'N/A'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <BarChart3 className={`h-3.5 w-3.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {/* Placeholder score - you can add this to Application type */}
                            720
                        </span>
                    </div>
                </div>

                {/* Missing Docs indicator (if applicable) */}
                {application.note && application.note.toLowerCase().includes('missing') && (
                    <div className="pt-2 mt-2">
                        <span className={`text-xs font-medium ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                            & Missing Docs
                        </span>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ApplicationCard;

