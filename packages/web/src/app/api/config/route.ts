import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const configDir = path.join(os.homedir(), ".magnetar");
const configFile = path.join(configDir, "cli-config.json");

export async function GET() {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, "utf8");
      return NextResponse.json(JSON.parse(data));
    }
    return NextResponse.json({ provider: null, messages: [] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to write config" }, { status: 500 });
  }
}
