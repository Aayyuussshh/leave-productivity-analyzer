import formidable from "formidable";
import XLSX from "xlsx";
import db from "../../lib/db";

export const config = {
  api: { bodyParser: false },
};

// ---------- Helpers ----------

function excelDateToJSDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d)) return d;
  }
  throw new Error("Invalid Excel date value");
}

function validateTimeFormat(timeStr) {
  if (!timeStr) return null;

  if (typeof timeStr === "number") {
    const totalSeconds = timeStr * 24 * 60 * 60;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  const str = timeStr.toString().trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const [, h, m, s = "00"] = match;
    return `${h.padStart(2, "0")}:${m}:${s}`;
  }

  if (/^\d+$/.test(str)) {
    const h = parseInt(str, 10);
    if (h >= 0 && h < 24) return `${h.toString().padStart(2, "0")}:00:00`;
  }

  return null;
}

// ---------- Handler ----------

export default async function handler(req, res) {
  // ✅ Railway DB guard
  if (!db) {
    return res.status(500).json({
      error: "Database not available (Railway environment)",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(400).json({ error: "File upload failed" });
    }

    const uploadedFile = Array.isArray(files.file)
      ? files.file[0]
      : files.file;

    if (!uploadedFile?.filepath) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.readFile(uploadedFile.filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length <= 1) {
      return res.status(400).json({ error: "Excel file has no data" });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      for (let i = 0; i < dataRows.length; i++) {
        const rowObj = {};
        headers.forEach((h, idx) => (rowObj[h] = dataRows[i][idx]));

        const isEmpty = Object.values(rowObj).every(
          (v) => v === null || v === undefined
        );
        if (isEmpty) continue;

        try {
          const employeeCode = rowObj["Employee ID"];
          const dateRaw = rowObj["Date"];
          const inTime = validateTimeFormat(rowObj["In-Time"]);
          const outTime = validateTimeFormat(rowObj["Out-Time"]);

          if (!employeeCode || !dateRaw) {
            errorCount++;
            continue;
          }

          let date = excelDateToJSDate(dateRaw)
            .toISOString()
            .split("T")[0];

          const day = new Date(date).getDay();

          let expectedHours = 0;
          let isLeave = 0;

          if (day === 0) {
            expectedHours = 0;
          } else if (day === 6) {
            expectedHours = 4;
            if (!inTime || !outTime) isLeave = 1;
          } else {
            expectedHours = 8.5;
            if (!inTime || !outTime) isLeave = 1;
          }

          let workedHours = 0;
          if (!isLeave && inTime && outTime) {
            let diff =
              new Date(`1970-01-01T${outTime}`) -
              new Date(`1970-01-01T${inTime}`);
            if (diff < 0) diff += 24 * 3600 * 1000;
            workedHours = diff / 3600000;
          }

          const [[emp]] = await connection.query(
            "SELECT id FROM employees WHERE employee_code = ?",
            [employeeCode]
          );

          let empId = emp?.id;
          if (!empId) {
            const [result] = await connection.query(
              "INSERT INTO employees (employee_code, name) VALUES (?, ?)",
              [employeeCode, employeeCode]
            );
            empId = result.insertId;
          }

          const [[existing]] = await connection.query(
            "SELECT id FROM attendance WHERE employee_id = ? AND DATE(date) = ?",
            [empId, date]
          );

          if (existing) {
            await connection.query(
              `UPDATE attendance
               SET in_time=?, out_time=?, worked_hours=?, expected_hours=?, is_leave=?
               WHERE id=?`,
              [inTime, outTime, workedHours, expectedHours, isLeave, existing.id]
            );
          } else {
            await connection.query(
              `INSERT INTO attendance
               (employee_id, date, in_time, out_time, worked_hours, expected_hours, is_leave)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [empId, date, inTime, outTime, workedHours, expectedHours, isLeave]
            );
          }

          successCount++;
        } catch (rowErr) {
          errorCount++;
          if (errors.length < 10) errors.push(rowErr.message);
        }
      }

      await connection.commit();

      return res.status(200).json({
        success: true,
        summary: {
          successCount,
          errorCount,
          errors,
        },
      });
    } catch (e) {
      await connection.rollback();
      return res.status(500).json({
        error: "Upload failed",
        details: e.message,
      });
    } finally {
      connection.release();
    }
  });
}
