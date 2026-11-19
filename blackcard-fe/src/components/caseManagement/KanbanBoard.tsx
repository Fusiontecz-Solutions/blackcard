import KanbanColumn from './KanbanColumn';
import type { Application } from '@/types/applicationTypes';

interface KanbanBoardProps {
    applicationsByStatus: Record<string, Application[]>;
    statuses: Array<{ id: string; label: string; color: string }>;
    loading: boolean;
    onCardClick: (applicationId: string) => void;
    onDrop: (applicationId: string, newStatus: string) => void;
}

const KanbanBoard = ({ applicationsByStatus, statuses, loading, onCardClick, onDrop }: KanbanBoardProps) => {
    return (
        <div className="overflow-x-auto p-5">
            <div className="flex gap-4 min-w-max">
                {statuses.map((status) => {
                    const applications = applicationsByStatus[status.id] || [];
                    const count = applications.length;

                    return (
                        <KanbanColumn
                            key={status.id}
                            status={status}
                            applications={applications}
                            count={count}
                            loading={loading}
                            onCardClick={onCardClick}
                            onDrop={onDrop}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default KanbanBoard;

