import { Button } from "@/components/ui/button";
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";
import { type Table as ReactTable } from "@tanstack/react-table";

interface DataTablePaginationProps<TData> {
    table: ReactTable<TData>;
    totalItems?: number;
    showSelectedCount?: boolean;
}

export default function DataTablePagination<TData>({
    table,
    totalItems,
    showSelectedCount = true,
}: DataTablePaginationProps<TData>) {
    const pageCount = table.getPageCount();
    const currentPage = table.getState().pagination.pageIndex + 1;
    const pageSize = table.getState().pagination.pageSize;
    const total = totalItems ?? table.getFilteredRowModel().rows.length;

    // Generate page numbers for pagination
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisiblePages = 5;

        if (pageCount <= maxVisiblePages) {
            for (let i = 1; i <= pageCount; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(pageCount);
            } else if (currentPage >= pageCount - 2) {
                pages.push(1);
                pages.push('...');
                for (let i = pageCount - 3; i <= pageCount; i++) {
                    pages.push(i);
                }
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                    pages.push(i);
                }
                pages.push('...');
                pages.push(pageCount);
            }
        }
        return pages;
    };

    const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

    return (
        <div className="px-4 md:px-5 py-4 border-t bg-card rounded-b-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                        {total === 0 ? (
                            <>0 entries</>
                        ) : (
                            <>
                                Showing {((currentPage - 1) * pageSize) + 1} to{' '}
                                {Math.min(currentPage * pageSize, total)} of {total} entries
                            </>
                        )}
                    </span>
                    {showSelectedCount && selectedRowCount > 0 && (
                        <span className="text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                            {selectedRowCount} selected
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* First page */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    {/* Previous page */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Page numbers */}
                    {getPageNumbers().map((page, index) => (
                        <Button
                            key={index}
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="icon"
                            className={`h-8 w-8 ${currentPage === page
                                ? 'bg-[#2F80ED] text-white hover:bg-[#2F80ED]/90'
                                : ''
                                }`}
                            onClick={() => typeof page === 'number' && table.setPageIndex(page - 1)}
                            disabled={page === '...'}
                        >
                            {page}
                        </Button>
                    ))}

                    {/* Next page */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    {/* Last page */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => table.setPageIndex(pageCount - 1)}
                        disabled={!table.getCanNextPage()}
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

