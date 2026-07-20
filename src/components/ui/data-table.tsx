import React, { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  className?: string;
  sortValue?: (item: T) => any;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  renderRow?: (item: T, index: number, defaultRow: React.ReactElement) => React.ReactNode;
}

export function DataTable<T>({ columns, data, emptyMessage = "No records found.", renderRow }: DataTableProps<T>) {
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  const handleSort = (index: number) => {
    const col = columns[index];
    if (!col.sortValue) return; // not sortable

    if (sortIndex === index) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortIndex(null);
        setSortDirection(null);
      }
    } else {
      setSortIndex(index);
      setSortDirection("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (sortIndex === null || sortDirection === null) return data;
    const col = columns[sortIndex];
    if (!col.sortValue) return data;

    const sorted = [...data].sort((a, b) => {
      const valA = col.sortValue!(a);
      const valB = col.sortValue!(b);

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const factor = sortDirection === "asc" ? 1 : -1;

      // Numerical comparison if both values are numbers or numeric strings
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== "boolean" && typeof valB !== "boolean") {
        return (numA - numB) * factor;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB) * factor;
      }
      return (valA < valB ? -1 : 1) * factor;
    });
    return sorted;
  }, [data, sortIndex, sortDirection, columns]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((column, i) => {
              const isSortable = !!column.sortValue;
              const isSorted = sortIndex === i;

              return (
                <TableHead
                  key={i}
                  className={`${column.className || ""} ${
                    isSortable ? "cursor-pointer select-none hover:bg-muted/60 hover:text-foreground transition-colors" : ""
                  }`}
                  onClick={() => isSortable && handleSort(i)}
                >
                  <div className="flex items-center gap-1.5 py-1">
                    <span>{column.header}</span>
                    {isSortable && (
                      <span className="shrink-0">
                        {isSorted ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/30 hover:text-muted-foreground" />
                        )}
                      </span>
                    )}
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-xs text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((item, index) => {
              const defaultRow: React.ReactElement = (
                <TableRow key={index} className="hover:bg-muted/20 border-b border-border/55 last:border-b-0">
                  {columns.map((column, i) => (
                    <TableCell key={i} className={column.className}>
                      {column.accessor(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
              return renderRow ? renderRow(item, index, defaultRow) : defaultRow;
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
