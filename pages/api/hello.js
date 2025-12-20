import db from "../../lib/db";

export default async function handler(req, res) {
  try {
    const [rows] = await db.query("SELECT 1");
    res.status(200).json({
      success: true,
      message: "Database connected successfully",
      rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
