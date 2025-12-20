import formidable from "formidable";
import XLSX from "xlsx";
import db from "../../lib/db";

/**
 * IMPORTANT: Disable body parser for file upload
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Helper: Convert Excel date safely
 */
function excelDateToJSDate(value) {
  if (!value) return null;

  // Already JS Date
  if (value instanceof Date) return value;

  // Excel serial number
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  // String date (YYYY-MM-DD or DD/MM/YYYY)
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d)) return d;
  }

  throw new Error("Invalid Excel date value");
}

/**
 * Helper: Validate and format time - UPDATED TO BE MORE ROBUST
 */
function validateTimeFormat(timeStr) {
  if (!timeStr) return null;

  // Convert to string and trim
  let timeString = timeStr.toString().trim();

  // Handle case where time is stored as a number (Excel serial time)
  if (typeof timeStr === "number") {
    // Convert Excel serial time to HH:MM:SS
    const totalSeconds = timeStr * 24 * 60 * 60; // Convert to seconds
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Handle different time formats (HH:MM, HH:MM:SS)
  const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const match = timeString.match(timeRegex);

  if (match) {
    const [, hours, minutes, seconds = '00'] = match;
    return `${hours.padStart(2, '0')}:${minutes}:${seconds}`;
  }

  // Try to parse as a simple number (e.g., 10 for 10:00:00)
  if (/^\d+$/.test(timeString)) {
    const hours = parseInt(timeString, 10);
    if (hours >= 0 && hours < 24) {
      return `${hours.toString().padStart(2, '0')}:00:00`;
    }
  }

  return null;
}

// Define the handler function with a name (optional, but good practice)
async function uploadHandler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(400).json({ error: "File upload failed" });
      }

      // ✅ SAFELY extract uploaded file
      const uploadedFile = Array.isArray(files.file)
        ? files.file[0]
        : files.file;

      if (!uploadedFile || !uploadedFile.filepath) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log("Uploaded file path:", uploadedFile.filepath);

      // ✅ Read Excel
      const workbook = XLSX.readFile(uploadedFile.filepath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      // ✅ CRITICAL FIX: Use the first row as headers
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows.length) {
        return res.status(400).json({ error: "Excel file is empty" });
      }

      // Extract headers from the first row
      const headers = rows[0];
      console.log("Excel headers:", headers);

      // Remove the header row to get only data rows
      const dataRows = rows.slice(1);
      console.log("Excel data rows parsed:", dataRows.length);

      // If no data rows after removing headers, return error
      if (dataRows.length === 0) {
        return res.status(400).json({ error: "Excel file contains only headers, no data" });
      }

      // Create an array of objects using the headers
      const parsedRows = dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index];
        });
        return obj;
      });

      console.log("Sample parsed row:", parsedRows[0]);

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];

        // ✅ CRITICAL FIX: Check if the row is empty (all values are undefined or null)
        const isEmptyRow = Object.values(row).every(val => val === undefined || val === null);
        if (isEmptyRow) {
          console.log(`Row ${i + 1}: Skipping empty row`);
          continue; // Skip this row
        }

        try {
          // ✅ Use the exact column names from your dataset
          const employeeId = row["Employee ID"] || row["employee_id"];
          const dateValue = row["Date"] || row["date"];
          const inTimeRaw = row["In-Time"] || row["in_time"];
          const outTimeRaw = row["Out-Time"] || row["out_time"];

          console.log(`Processing row ${i + 1}:`, {
            employeeId,
            dateValue,
            inTimeRaw,
            outTimeRaw
          });

          if (!employeeId || !dateValue) {
            console.warn(`Row ${i + 1}: Missing employee ID or date`);
            errors.push(`Row ${i + 1}: Missing employee ID or date`);
            errorCount++;
            continue;
          }

          // ✅ Convert and validate date
          let date;
          try {
            date = excelDateToJSDate(dateValue);
            // Format to ISO string to avoid timezone issues
            date = date.toISOString().split("T")[0];
          } catch (dateError) {
            console.error(`Row ${i + 1}: Invalid date format:`, dateValue);
            errors.push(`Row ${i + 1}: Invalid date format: ${dateValue}`);
            errorCount++;
            continue;
          }

          // ✅ Validate and format times
          const inTime = validateTimeFormat(inTimeRaw);
          const outTime = validateTimeFormat(outTimeRaw);

          console.log(`Formatted times - In: ${inTime}, Out: ${outTime}`);

          // ✅ Find employee by ID first
          let [empRows] = await db.query(
            "SELECT id FROM employees WHERE employee_code = ? LIMIT 1",
            [employeeId]
          );

          let empId = null;
          if (empRows.length > 0) {
            empId = empRows[0].id;
            console.log(`Found existing employee: ${employeeId} (ID: ${empId})`);
          } else {
            console.log(`Employee not found: ${employeeId}. Attempting to create...`);
            // ✅ Option C: Create employee if not found
            try {
              // Generate a more meaningful placeholder name
              // This assumes your employee codes are like E001, E002, etc.
              // You can customize this logic as needed.
              let displayName = employeeId;
              // If you want to extract a number from the code (e.g., E001 -> 1)
              const match = employeeId.match(/^E(\d+)$/);
              if (match) {
                const empNumber = parseInt(match[1], 10);
                displayName = `Employee ${empNumber}`;
              }

              const insertResult = await db.query(
                `INSERT INTO employees (employee_code, name) VALUES (?, ?)`,
                [employeeId, displayName]
              );
              empId = insertResult.insertId; // Get the newly created employee's ID
              console.log(`Created new employee: ${employeeId} (ID: ${empId})`);
            } catch (createError) {
              console.error(`Failed to create employee ${employeeId}:`, createError);
              errors.push(`Row ${i + 1}: Failed to create employee ${employeeId} - ${createError.message}`);
              errorCount++;
              continue; // Skip processing this row
            }
          }

          // ✅ Business rules - IMPLEMENTED EXACTLY AS PER REQUIREMENTS
          // Convert the date string back to a Date object for day calculation
          const dateObj = new Date(date);
          const day = dateObj.getDay(); // 0 = Sun, 6 = Sat

          let isLeave = 0;
          let expectedHours = 0;

          // Sunday → OFF (not leave)
          if (day === 0) {
            isLeave = 0;
            expectedHours = 0;
          }
          // Saturday
          else if (day === 6) {
            expectedHours = 4;
            if (!inTime || !outTime) {
              isLeave = 1;
            }
          }
          // Monday–Friday
          else {
            expectedHours = 8.5;
            if (!inTime || !outTime) {
              isLeave = 1;
            }
          }

          let workedHours = null;
          if (!isLeave && inTime && outTime) {
            try {
              const inDt = new Date(`1970-01-01T${inTime}`);
              const outDt = new Date(`1970-01-01T${outTime}`);

              if (!isNaN(inDt) && !isNaN(outDt)) {
                workedHours = (outDt - inDt) / (1000 * 60 * 60);
                // Handle negative hours (next day checkout)
                if (workedHours < 0) {
                  workedHours += 24;
                }
              }
            } catch (timeError) {
              console.error(`Row ${i + 1}: Error calculating worked hours:`, timeError);
            }
          }

          // ✅ CRITICAL FIX: Check if record already exists using DATE() function
          const [existingRows] = await db.query(
            "SELECT id FROM attendance WHERE employee_id = ? AND DATE(date) = ? LIMIT 1",
            [empId, date]
          );

          if (existingRows.length > 0) {
            console.log(`Row ${i + 1}: Attendance already exists for ${employeeId} on ${date}, updating...`);

            // Update existing record
            await db.query(
              `UPDATE attendance 
               SET in_time = ?, out_time = ?, worked_hours = ?, is_leave = ?, expected_hours = ?
               WHERE employee_id = ? AND DATE(date) = ?`,
              [inTime, outTime, workedHours, isLeave, expectedHours, empId, date]
            );
          } else {
            // ✅ Insert new attendance record
            await db.query(
              `INSERT INTO attendance
                (employee_id, date, in_time, out_time, worked_hours, is_leave, expected_hours)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [empId, date, inTime, outTime, workedHours, isLeave, expectedHours]
            );
          }

          console.log(`✅ Row ${i + 1}: Successfully processed ${employeeId} for ${date}`);
          successCount++;

        } catch (rowError) {
          console.error(`❌ Row ${i + 1} processing error:`, rowError);
          errors.push(`Row ${i + 1}: ${rowError.message}`);
          errorCount++;
        }
      }

      // ✅ Return comprehensive response
      const response = {
        success: true,
        message: "Excel processing completed",
        summary: {
          totalRows: parsedRows.length,
          successCount,
          errorCount,
          errors: errors.length > 0 ? errors.slice(0, 10) : []
        }
      };

      console.log("Upload summary:", response.summary);
      return res.status(200).json(response);

    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error.message
      });
    }
  });
}

// Export the named function as the default export
export default uploadHandler;