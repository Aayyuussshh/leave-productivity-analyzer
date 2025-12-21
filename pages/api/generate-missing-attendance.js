import db from "../../lib/db";

// Helper: get expected hours by day
function getExpectedHours(day) {
  if (day >= 1 && day <= 5) return 8.5; // Mon–Fri
  if (day === 6) return 4;              // Saturday
  return 0;                             // Sunday
}

// Helper: get all dates of a month (timezone-safe)
function getMonthDates(year, month) {
  const dates = [];
  let currentDate = new Date(year, month - 1, 1, 12); // noon = safe

  while (currentDate.getMonth() === month - 1) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

export default async function handler(req, res) {
  // ✅ Railway DB guard
  if (!db) {
    return res.status(500).json({
      error: "Database not available (Railway environment)",
    });
  }

  // ✅ This endpoint MUST be POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  const { employeeId, month } = req.body; // safer than query for mutation

  if (!employeeId || !month) {
    return res.status(400).json({
      error: "employeeId and month are required",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [year, mon] = month.split("-").map(Number);
    const dates = getMonthDates(year, mon);

    let inserted = 0;

    for (const d of dates) {
      const day = d.getDay();
      if (day === 0) continue; // Sunday = Off

      const dateStr = d.toISOString().split("T")[0];
      const expectedHours = getExpectedHours(day);

      const [existing] = await connection.query(
        `SELECT id FROM attendance WHERE employee_id = ? AND date = ?`,
        [employeeId, dateStr]
      );

      if (existing.length === 0) {
        await connection.query(
          `
          INSERT INTO attendance
          (employee_id, date, in_time, out_time, worked_hours, expected_hours, is_leave)
          VALUES (?, ?, NULL, NULL, 0, ?, 1)
          `,
          [employeeId, dateStr, expectedHours]
        );
        inserted++;
      }
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Missing attendance auto-generated",
      employeeId: Number(employeeId),
      month,
      insertedLeaves: inserted,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Generate missing attendance error:", err);
    return res.status(500).json({
      error: "Failed to generate missing attendance",
      details: err.message,
    });
  } finally {
    connection.release();
  }
}
