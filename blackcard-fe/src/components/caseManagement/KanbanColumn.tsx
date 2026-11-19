import { useTheme } from '@/context/ThemeContext';
import { useState, useRef, useEffect } from 'react';
import ApplicationCard from './ApplicationCard';
import type { Application } from '@/types/applicationTypes';

interface KanbanColumnProps {
    status: { id: string; label: string; color: string };
    applications: Application[];
    count: number;
    loading: boolean;
    onCardClick: (applicationId: string) => void;
    onDrop: (applicationId: string, newStatus: string) => void;
}

const KanbanColumn = ({ status, applications, count, loading, onCardClick, onDrop }: KanbanColumnProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounter = useRef(0);
    const columnRef = useRef<HTMLDivElement>(null);

    // Reset drag state if it gets stuck (safety mechanism)
    useEffect(() => {
        const handleGlobalDragEnd = () => {
            dragCounter.current = 0;
            setIsDragOver(false);
        };

        document.addEventListener('dragend', handleGlobalDragEnd);
        return () => {
            document.removeEventListener('dragend', handleGlobalDragEnd);
        };
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        // Only set drag over if we have valid drag data
        const hasValidData = e.dataTransfer.types.includes('applicationId') || e.dataTransfer.types.includes('text/plain');
        if (hasValidData && !isDragOver) {
            setIsDragOver(true);
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        const hasValidData = e.dataTransfer.types.includes('applicationId') || e.dataTransfer.types.includes('text/plain');
        if (hasValidData) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Check if we're actually leaving the column (not just moving to a child element)
        const relatedTarget = e.relatedTarget as Node;
        const currentTarget = e.currentTarget as HTMLElement;
        
        // Only decrement if we're leaving the column entirely (relatedTarget is not a child)
        if (!relatedTarget || (currentTarget && !currentTarget.contains(relatedTarget))) {
            dragCounter.current = Math.max(0, dragCounter.current - 1);
            if (dragCounter.current === 0) {
                setIsDragOver(false);
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Always reset drag state on drop
        dragCounter.current = 0;
        setIsDragOver(false);
        
        const applicationId = e.dataTransfer.getData('applicationId') || e.dataTransfer.getData('text/plain');
        if (applicationId) {
            onDrop(applicationId, status.id);
        }
    };

    return (
        <div
            ref={columnRef}
            className={`flex flex-col w-80 rounded-lg p-4 ${isDark ? 'bg-card' : 'bg-white'}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Column Header */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                            {status.label}
                        </h3>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${isDark ? 'bg-muted text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                        {count}
                    </span>
                </div>
                <div className={`h-1 rounded-full ${status.color}`}></div>
            </div>

            {/* Cards */}
            <div className="flex flex-col cursor-pointer gap-3">
                {loading ? (
                    <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Loading...
                    </div>
                ) : (
                    applications.map((application) => (
                        <ApplicationCard
                            key={application._id}
                            application={application}
                            onClick={() => onCardClick(application._id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default KanbanColumn;

