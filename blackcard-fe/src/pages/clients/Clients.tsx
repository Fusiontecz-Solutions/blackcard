import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Filter,
  ChevronDown,
  Search,
  Plus,
  MoreHorizontal,
  Download,
  Upload,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { isListBlockingLoad } from "@/lib/listLoading";
import {
  getClients,
  deleteClient,
  createClient,
} from "@/redux/actions/clientActions";
import {
  resetDeleteClient,
  resetCreateClient,
} from "@/redux/slices/clientSlice";
import { toast } from "react-toastify";
import type { Client } from "@/types/clientTypes";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type PaginationState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTableContent, DataTablePagination } from "@/components/DataTable";
import { useTheme } from "@/context/ThemeContext";
import * as XLSX from "xlsx-js-style";
import type { CreateClientPayload } from "@/types/clientTypes";
import { formatUSPhoneNumber } from "@/utils/formatPhoneNumber";

const getClientOwnerNames = (client: Client): string => {
  const owners =
    client.owners?.length ? client.owners : client.owner ? [client.owner] : [];

  if (owners.length === 0) return "-";

  const names = owners
    .map((owner) =>
      [owner.firstName, owner.middleName, owner.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "-";
};

export default function Clients() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Skip per-delete toast when bulk delete is in progress (show one summary toast instead)
  const isBulkDeleteRef = useRef(false);

  // Redux state
  const {
    loading,
    data: clients,
    pagination: apiPagination,
    error,
  } = useSelector((state: RootState) => state.clients);
  const {
    loading: deleteLoading,
    success: deleteSuccess,
    error: deleteError,
  } = useSelector((state: RootState) => state.deleteClient);

  // Handle delete
  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm("Are you sure you want to delete this client?")) {
        dispatch(deleteClient(id));
      }
    },
    [dispatch],
  );

  // Format date (Month Day, Year)
  const formatDate = useCallback((dateString?: string) => {
    return formatDateUtil(dateString ?? "", "-");
  }, []);

  // Download Excel template
  const handleDownloadTemplate = useCallback(() => {
    // Define all column headers based on CreateClient form fields
    const headers = [
      // Business Profile fields
      "Business Name",
      "Business Email",
      "Business Phone Number",
      "Business Website",
      "Incorporation Date",
      "Incorporation State",
      "Business Entity Type",
      "EIN Number",
      "Monthly Revenue",
      "Business Address 1",
      "Business Address 2",
      "Business City",
      "Business State",
      "Business Zip Code",
      // Owner Detail fields
      "Owner First Name",
      "Owner Middle Name",
      "Owner Last Name",
      "Owner Email",
      "Owner Mobile Number",
      "Owner Date of Birth",
      "Owner SSN",
      "Owner FICO Score",
      "Ownership Start Date",
      "Ownership Percentage",
      "Owner Address 1",
      "Owner Address 2",
      "Owner City",
      "Owner State",
      "Owner Zip Code",
    ];

    // Create worksheet with headers in Row 1 (A1, B1, C1, etc.)
    // This ensures headers are written to actual cells and won't disappear
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);

    // Make headers bold and styled by adding style to each header cell
    headers.forEach((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      const cell = worksheet[cellAddress];
      if (cell) {
        // Add bold styling with xlsx-js-style
        cell.s = {
          font: {
            bold: true,
            sz: 11,
            color: { rgb: "000000" },
          },
          fill: {
            fgColor: { rgb: "E6E6E6" }, // Light gray background
          },
          alignment: {
            horizontal: "left",
            vertical: "center",
            wrapText: true,
          },
          border: {
            bottom: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    });

    // Set column widths for better readability
    const columnWidths = headers.map((header) => ({
      wch: Math.max(header.length + 2, 15), // Dynamic width based on header length, minimum 15
    }));
    worksheet["!cols"] = columnWidths;

    // Freeze the first row so headers stay visible when scrolling
    worksheet["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    };

    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Client Template");

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    // Create blob and download
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "client_template.xlsx");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Excel template downloaded successfully!");
  }, []);

  // Define columns
  const columns: ColumnDef<Client>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border text-blue-600 cursor-pointer"
            checked={table.getIsAllPageRowsSelected()}
            ref={(input) => {
              if (input) {
                input.indeterminate = table.getIsSomePageRowsSelected();
              }
            }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border text-blue-600 cursor-pointer"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "clientId",
        header: ({ column }) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="p-0 h-auto font-medium text-foreground hover:bg-transparent hover:text-foreground cursor-pointer"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              <span className="font-medium text-foreground">ID</span>
              <ArrowUpDown className="ml-1 h-3 w-3" />
            </Button>
          </div>
        ),
        cell: ({ row }) => {
          const client = row.original;
          return (
            <span className="font-medium ml-3 text-foreground">
              {client.clientId || client._id.slice(-6).toUpperCase()}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: "business.name",
        header: ({ column }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">BUSINESS NAME</span>
            {/* <Button
                        variant="ghost"
                        className="p-0 h-auto font-medium text-foreground hover:bg-transparent hover:text-foreground cursor-pointer"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button> */}
          </div>
        ),
        cell: ({ row }) => {
          const client = row.original;
          return (
            <span className="text-foreground">
              {client.business?.name || "-"}
            </span>
          );
        },
      },
      {
        id: "ownerName",
        accessorFn: (row) => getClientOwnerNames(row),
        header: ({ column }) => (
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">OWNER NAME</span>
            {/* <Button
                        variant="ghost"
                        className="p-0 h-auto font-medium text-foreground hover:bg-transparent hover:text-foreground cursor-pointer"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button> */}
          </div>
        ),
        cell: ({ row }) => {
          const client = row.original;
          return (
            <span className="text-foreground">
              {getClientOwnerNames(client)}
            </span>
          );
        },
      },
      {
        id: "email",
        accessorFn: (row) => row.business?.email || row.owner?.email || "",
        header: ({ column }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">EMAIL</span>
          </div>
        ),
        cell: ({ row }) => {
          const client = row.original;
          return (
            <span className="text-foreground">
              {client.business?.email || client.owner?.email || "-"}
            </span>
          );
        },
      },
      {
        id: "mobile",
        accessorFn: (row) =>
          formatUSPhoneNumber(
            row.business?.number || row.owner?.mobileNumber || "",
          ),
        header: ({ column }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">MOBILE</span>
          </div>
        ),
        cell: ({ row }) => {
          const client = row.original;
          const rawPhone = client.business?.number || client.owner?.mobileNumber;
          return (
            <span className="font-medium text-black text-foreground">
              {rawPhone ? formatUSPhoneNumber(rawPhone) : "-"}
            </span>
          );
        },
      },
      {
        id: "state",
        accessorFn: (row) =>
          row.business?.address?.state ||
          row.business?.incorporationState ||
          "",
          header: ({ column }) => (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">STATE</span>
            </div>
          ),
        cell: ({ row }) => {
          const client = row.original;
          return (
            <span className="font-medium text-foreground">
              {client.business?.address?.state ||
                client.business?.incorporationState ||
                "-"}
            </span>
          );
        },
      },
      // {
      //   accessorKey: "status",
      //   header: ({ column }) => (
      //     <div className="flex items-center gap-2">
      //       <span className="font-medium text-foreground">STATUS</span>
      //       {/* <Button
      //                   variant="ghost"
      //                   className="p-0 h-auto font-medium text-foreground hover:bg-transparent hover:text-foreground cursor-pointer"
      //                   onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      //               >
      //                   <ArrowUpDown className="ml-1 h-3 w-3" />
      //               </Button> */}
      //     </div>
      //   ),
      //   cell: ({ row }) => {
      //     const status = row.getValue("status") as string;
      //     return (
      //       <span
      //         className={`px-2 py-1 rounded-full text-xs font-medium ${
      //           status === "Active"
      //             ? "bg-green-100 text-green-700"
      //             : status === "Inactive"
      //               ? "bg-red-100 text-red-700"
      //               : status === "Pending"
      //                 ? "bg-yellow-100 text-yellow-700"
      //                 : "bg-gray-100 text-gray-700"
      //         }`}
      //       >
      //         {status || "Pending"}
      //       </span>
      //     );
      //   },
      // },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">CREATED AT</span>
            {/* <Button
                        variant="ghost"
                        className="p-0 h-auto font-medium text-foreground hover:bg-transparent hover:text-foreground cursor-pointer"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button> */}
          </div>
        ),
        cell: ({ row }) => {
          const date = row.getValue("createdAt") as string;
          return <span className="text-foreground">{formatDate(date)}</span>;
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right text-foreground">ACTION</div>,
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div className="text-right" data-row-click-ignore>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground hover:text-foreground hover:bg-transparent cursor-pointer"
                    disabled={deleteLoading}
                  >
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e: Event) => {
                      e.preventDefault();
                      navigate(`/create-clients/${client.clientId}?mode=view`);
                    }}
                  >
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e: Event) => {
                      e.preventDefault();
                      navigate(`/create-clients/${client.clientId}`);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onSelect={(e: Event) => {
                      e.preventDefault();
                      handleDelete(client._id);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [deleteLoading, formatDate, handleDelete, navigate],
  );

  const clientsListBlockingLoad = isListBlockingLoad({
    rowCount: clients?.length ?? 0,
    loading,
    awaitingFirstLoad: apiPagination == null,
  });

  // Calculate total items and page count for server-side pagination
  const totalItems = apiPagination?.total || clients?.length || 0;
  const pageCount =
    apiPagination?.totalPages ||
    Math.ceil(totalItems / pagination.pageSize) ||
    1;

  // Initialize table
  const table = useReactTable({
    data: clients || [],
    columns,
    pageCount,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    manualPagination: true, // Server-side pagination
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    getRowId: (row) => row._id,
  });

  // Derived: selected client IDs from table row selection (for bulk delete)
  const selectedClientIds = useMemo(
    () => Object.keys(rowSelection).filter(Boolean),
    [rowSelection],
  );

  // Fetch clients - depends on pagination state
  const fetchClients = useCallback(() => {
    const params: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
    } = {
      page: pagination.pageIndex + 1, // API uses 1-based index
      limit: pagination.pageSize,
    };
    if (searchTerm) {
      params.search = searchTerm;
    }
    if (statusFilter !== "all") {
      params.status = statusFilter;
    }
    dispatch(getClients(params));
  }, [
    dispatch,
    pagination.pageIndex,
    pagination.pageSize,
    searchTerm,
    statusFilter,
  ]);

  // Bulk delete: delete selected clients via API, then refresh list and clear selection
  const handleBulkDelete = useCallback(async () => {
    if (selectedClientIds.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedClientIds.length} selected client(s)?`,
    );
    if (!confirmed) return;
    isBulkDeleteRef.current = true;
    try {
      await Promise.all(
        selectedClientIds.map((id) => dispatch(deleteClient(id)).unwrap()),
      );
      toast.success(
        selectedClientIds.length === 1
          ? "Client deleted successfully!"
          : `${selectedClientIds.length} clients deleted successfully!`,
      );
      dispatch(resetDeleteClient());
      setRowSelection({});
      fetchClients();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete some clients");
      dispatch(resetDeleteClient());
      fetchClients();
      setRowSelection({});
    } finally {
      isBulkDeleteRef.current = false;
    }
  }, [selectedClientIds, dispatch, fetchClients]);

  // Map Excel row data to CreateClientPayload format
  const mapExcelRowToClientPayload = useCallback(
    (row: any): CreateClientPayload | null => {
      try {
        // Helper function to clean and convert values
        const cleanValue = (value: any): string => {
          if (value === null || value === undefined) return "";
          return String(value).trim();
        };

        const cleanNumber = (value: any): number | string => {
          const cleaned = cleanValue(value);
          if (!cleaned) return "";
          const num = parseFloat(cleaned.replace(/[^0-9.-]+/g, ""));
          return isNaN(num) ? "" : num;
        };

        // Map Excel columns to CreateClientPayload structure
        const owner = {
            firstName: cleanValue(row["Owner First Name"]),
            middleName: cleanValue(row["Owner Middle Name"]),
            lastName: cleanValue(row["Owner Last Name"]),
            email: cleanValue(row["Owner Email"]),
            mobileNumber: formatUSPhoneNumber(cleanValue(row["Owner Mobile Number"])),
            dateOfBirth: cleanValue(row["Owner Date of Birth"]),
            ssn: cleanValue(row["Owner SSN"]),
            ficoScore: cleanNumber(row["Owner FICO Score"]),
            ownershipStartDate: cleanValue(row["Ownership Start Date"]),
            ownershipPercentage: cleanNumber(row["Ownership Percentage"]),
            address: {
              address1: cleanValue(row["Owner Address 1"]),
              address2: cleanValue(row["Owner Address 2"]),
              city: cleanValue(row["Owner City"]),
              state: cleanValue(row["Owner State"]),
              zipCode: cleanValue(row["Owner Zip Code"]),
            },
          };

        const payload: CreateClientPayload = {
          business: {
            name: cleanValue(row["Business Name"]),
            email: cleanValue(row["Business Email"]),
            number: formatUSPhoneNumber(cleanValue(row["Business Phone Number"])),
            website: cleanValue(row["Business Website"]),
            incorporationDate: cleanValue(row["Incorporation Date"]),
            incorporationState: cleanValue(row["Incorporation State"]),
            businessEntityType: cleanValue(row["Business Entity Type"]),
            einNumber: cleanValue(row["EIN Number"]),
            monthlyRevenue: cleanNumber(row["Monthly Revenue"]),
            address: {
              address1: cleanValue(row["Business Address 1"]),
              address2: cleanValue(row["Business Address 2"]),
              city: cleanValue(row["Business City"]),
              state: cleanValue(row["Business State"]),
              zipCode: cleanValue(row["Business Zip Code"]),
            },
          },
          owner,
          owners: [owner],
        };

        // Validate required fields
        if (!payload.business.name || !payload.business.email) {
          return null; // Skip rows with missing required fields
        }

        return payload;
      } catch (error) {
        console.error("Error mapping row:", error);
        return null;
      }
    },
    [],
  );

  // Handle file upload
  const handleFileUpload = useCallback(async () => {
    if (!uploadFile) {
      toast.error("Please select a file to upload");
      return;
    }

    // Validate file type
    const validExtensions = [".csv", ".xlsx", ".xls"];
    const fileExtension = uploadFile.name
      .substring(uploadFile.name.lastIndexOf("."))
      .toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      toast.error("Please upload a valid Excel or CSV file");
      return;
    }

    try {
      // Read Excel file
      const fileData = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(fileData, { type: "array" });

      // Get the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert worksheet to JSON - first row becomes keys automatically
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "", // Default value for empty cells
        raw: false, // Convert dates and numbers to strings
      }) as any[];

      // Check if file has data
      if (!jsonData || jsonData.length === 0) {
        toast.error("Excel file is empty or has no data rows");
        setIsUploadModalOpen(false);
        setUploadFile(null);
        return;
      }

      // Filter out empty rows
      const validRows = jsonData.filter((row) => {
        // Check if row has at least one non-empty value
        return Object.values(row).some(
          (val) => val && String(val).trim() !== "",
        );
      });

      if (validRows.length === 0) {
        toast.error("No valid data rows found in Excel file");
        setIsUploadModalOpen(false);
        setUploadFile(null);
        return;
      }

      // Process each row and create clients
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Process rows sequentially to avoid overwhelming the API
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const payload = mapExcelRowToClientPayload(row);

        if (!payload) {
          errorCount++;
          errors.push(
            `Row ${i + 2}: Missing required fields (Business Name or Business Email)`,
          );
          continue;
        }

        try {
          await dispatch(createClient(payload)).unwrap();
          successCount++;
          // Reset createSuccess after each successful create to prevent toast from showing on navigation
          dispatch(resetCreateClient());
        } catch (error: any) {
          errorCount++;
          const errorMessage = error?.message || error || "Unknown error";
          errors.push(`Row ${i + 2}: ${errorMessage}`);
          console.error(`Error creating client from row ${i + 2}:`, error);
          // Also reset on error to clear any partial success state
          dispatch(resetCreateClient());
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`Successfully created ${successCount} client(s)!`);
      }

      if (errorCount > 0) {
        const errorMsg = `${errorCount} row(s) failed. ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`;
        toast.error(errorMsg);
      }

      // Reset createClient success state to prevent toast from showing again on navigation
      // This is important because CreateClient component watches createSuccess and shows toast
      dispatch(resetCreateClient());

      // Close modal and refresh list
      setIsUploadModalOpen(false);
      setUploadFile(null);

      // Refresh clients list
      fetchClients();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        "Failed to process Excel file. Please check the file format and try again.",
      );
    }
  }, [uploadFile, dispatch, mapExcelRowToClientPayload, fetchClients]);

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setUploadFile(file);
      }
    },
    [],
  );

  // Initial fetch and on dependency change
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Handle delete success/error (single delete only; bulk delete shows one toast in handleBulkDelete)
  useEffect(() => {
    if (deleteSuccess) {
      if (isBulkDeleteRef.current) {
        dispatch(resetDeleteClient());
        return;
      }
      toast.success("Client deleted successfully!");
      dispatch(resetDeleteClient());
      fetchClients();
    }
    if (deleteError) {
      toast.error(deleteError);
      dispatch(resetDeleteClient());
    }
  }, [deleteSuccess, deleteError, dispatch, fetchClients]);

  // Handle search with debounce - reset to first page
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div
      className="min-h-screen bg-background p-0 md:p-0"
    >
      {/* <div className="flex items-center justify-between">
                <h1 className="text-[22px] font-semibold text-foreground">Client</h1>
            </div> */}

      <div
        className={`mt-0 flex flex-col md:flex-row items-stretch md:items-center gap-3 justify-between px-6 py-5 ${
          isDark ? "bg-[#141517]" : "bg-[white]"
        }`}
      >
        <div className="flex items-center w-full md:max-w-[520px] border border-input rounded-md bg-card overflow-hidden">
          {/* Filter Section */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 h-10 border-r border-input bg-transparent hover:bg-muted/50 transition-colors">
                <Filter className="size-4 text-[#4B5563]" />
                <span className="text-sm text-[#4B5563] capitalize">
                  {statusFilter === "all" ? "All" : statusFilter}
                </span>
                <ChevronDown className="size-4 text-[#4B5563]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  setStatusFilter("all");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                All
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setStatusFilter("Active");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                Active
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setStatusFilter("Inactive");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                Inactive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setStatusFilter("Pending");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                Pending
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setStatusFilter("Archived");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                Archived
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Search Section */}
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-3 size-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-9 pr-8 h-10 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute right-3 flex items-center">
              <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                /
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="px-4 py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer hover:text-white border-none text-sm shadow-none"
            onClick={() => setIsUploadModalOpen(true)}
          >
            <Upload className="size-4" />
            Upload Excel
          </Button>
          <Button
            className="px-4 py-2 gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer hover:text-white border-none text-sm shadow-none"
            onClick={() => navigate("/create-clients")}
          >
            <Plus className="size-4" />
            New Client
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-4 px-6 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Table Card */}
      <div className="px-6">
        <div
          className={`mt-5 rounded-sm border shadow-[0px_4px_20px_0px_#00000005] ${
            isDark
              ? "bg-[#141517] border-[#374151]"
              : "bg-card border-[#FDFDFD]"
          }`}
        >
          <div
            className={`px-6 py-2 border-none rounded-t-sm flex items-center justify-between gap-6 ${
              isDark ? "bg-[#2A2B2F]" : "bg-[#F9FAFD]"
            }`}
          >
            <span className="font-semibold text-foreground text-base uppercase">
              Clients
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1 cursor-pointer    text-xs shrink-0"
              disabled={selectedClientIds.length === 0 || deleteLoading}
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
          </div>

          <div className="p-1">
            <div className="overflow-x-auto">
              <DataTableContent
                table={table}
                loading={clientsListBlockingLoad}
                loadingMessage="Loading clients..."
                emptyMessage="No clients found"
                emptySubMessage="Try adjusting your search or filter criteria"
                onRowClick={(row) =>
                  navigate(`/create-clients/${row.original.clientId}?mode=view`)
                }
              />
            </div>
          </div>

          {/* Pagination */}
          {!loading && clients && clients.length > 0 && (
            <DataTablePagination
              table={table}
              totalItems={totalItems}
              showSelectedCount={false}
            />
          )}
        </div>
      </div>

      {/* Bulk delete bar at bottom of component */}
      {/* <div
                className={`flex items-center justify-between gap-4 px-6 py-3 mt-5 border rounded-sm ${
                    isDark
                        ? 'bg-[#141517] border-[#374151]'
                        : 'bg-card border-[#FDFDFD]'
                }`}
            >
                <span className="text-sm text-muted-foreground">
                    {selectedClientIds.length > 0
                        ? `${selectedClientIds.length} client(s) selected`
                        : 'Select clients to delete'}
                </span>
          
            </div> */}

      {/* Upload Excel Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className={`text-xl font-semibold ${isDark ? "text-gray-200" : "text-black"}`}
            >
              Upload Excel
            </DialogTitle>
            <DialogDescription
              className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              Download a template or upload your filled Excel file to import
              clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Download Template Button */}
            <Button
              onClick={handleDownloadTemplate}
              className="w-full flex items-center justify-center gap-2 bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
            >
              <Download className="size-4" />
              Download Template
            </Button>

            {/* Upload Template Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Upload Template
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="flex-1"
                />
              </div>
              {uploadFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {uploadFile.name}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadModalOpen(false);
                setUploadFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={!uploadFile}
              className="bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
            >
              <Upload className="size-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
