#!/bin/bash
# Medical App - Service Manager
# Usage: bash service.sh {start|stop|status|restart}

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="${SCRIPT_DIR}/medical-app.pid"
LOG_FILE="${SCRIPT_DIR}/medical-app.log"
ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.js"

SERVICE_NAME="Medical App"
SERVICE_ICON="🔬"
SERVICE_HOST="${SERVICE_HOST:-127.0.0.1}"

PORT="3234"
SERVER_SCRIPT="${SCRIPT_DIR}/server.js"

load_app_config() {
  eval "$({
    cd "$SCRIPT_DIR"
    node <<'NODE'
const app = (require('./ecosystem.config.js').apps || [])[0] || {};
const env = app.env || {};
const esc = (value) => String(value).replace(/'/g, "'\\''");
for (const [key, value] of Object.entries(env)) {
  console.log(`export ${key}='${esc(value)}'`);
}
console.log(`export APP_SCRIPT='${esc(app.script || 'server.js')}'`);
NODE
  })"

  if [ -n "$APP_SCRIPT" ]; then
    SERVER_SCRIPT="${SCRIPT_DIR}/${APP_SCRIPT}"
  fi

  if [ -n "$PORT" ]; then
    export PORT
  fi
}

# Verify whether a PID belongs to this Medical App instance
is_our_server_pid() {
  local pid="$1"

  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return 1
  fi

  if [ ! -f "/proc/$pid/cmdline" ]; then
    return 1
  fi

  local cmdline
  cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)

  if echo "$cmdline" | grep -Fq " $SERVER_SCRIPT"; then
    return 0
  fi

  if echo "$cmdline" | grep -Eq '(^|[[:space:]])server\.js([[:space:]]|$)'; then
    if [ -L "/proc/$pid/cwd" ]; then
      local cwd
      cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null)
      if [ "$cwd" = "$SCRIPT_DIR" ]; then
        return 0
      fi
    fi
  fi

  return 1
}

# Find Node.js on Synology
find_node() {
  local node_paths=(
    "/usr/local/bin/node"
    "/opt/bin/node"
    "/usr/bin/node"
    "/var/packages/Node.js_v18/target/bin/node"
    "/var/packages/Node.js_v20/target/bin/node"
    "/var/packages/Node.js_v22/target/bin/node"
  )

  local node_path
  for node_path in "${node_paths[@]}"; do
    if [ -x "$node_path" ]; then
      echo "$node_path"
      return
    fi
  done

  local node_bin
  node_bin=$(command -v node 2>/dev/null || true)
  if [ -n "$node_bin" ]; then
    echo "$node_bin"
    return
  fi

  echo ""
}

# Get the PID of the running service
get_pid() {
  local pid=""

  if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if is_our_server_pid "$pid"; then
      echo "$pid"
      return
    fi
    rm -f "$PID_FILE"
  fi

  local candidate
  for candidate in $(pgrep -f "node" 2>/dev/null); do
    if is_our_server_pid "$candidate"; then
      echo "$candidate" > "$PID_FILE"
      echo "$candidate"
      return
    fi
  done

  rm -f "$PID_FILE"
}

# Start the service
do_start() {
  load_app_config

  local running_pid
  running_pid=$(get_pid)
  if [ -n "$running_pid" ]; then
    echo "⚠️  ${SERVICE_NAME} is already running (PID: $running_pid)"
    return 0
  fi

  echo "${SERVICE_ICON} ${SERVICE_NAME}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local node_bin
  node_bin=$(find_node)
  if [ -z "$node_bin" ]; then
    echo "❌ Node.js not found. Install it via Synology Package Center."
    return 1
  fi

  echo "✅ Node.js: $($node_bin --version) at $node_bin"
  echo "✅ Port: ${PORT:-3234}"
  echo ""

  cd "$SCRIPT_DIR"
  nohup "$node_bin" "$SERVER_SCRIPT" >> "$LOG_FILE" 2>&1 &
  local server_pid=$!
  echo "$server_pid" > "$PID_FILE"

  sleep 1
  if kill -0 "$server_pid" 2>/dev/null; then
    echo "✅ ${SERVICE_NAME} started (PID: $server_pid)"
    echo "   Open: http://${SERVICE_HOST}:${PORT:-3234}"
    echo "   Log:  $LOG_FILE"
    echo ""
  else
    echo "❌ Failed to start ${SERVICE_NAME}. Check log: $LOG_FILE"
    return 1
  fi
}

# Stop the service
do_stop() {
  load_app_config

  local pids
  pids=$(get_pid)
  if [ -z "$pids" ]; then
    echo "ℹ️  ${SERVICE_NAME} is not running."
    rm -f "$PID_FILE"
    return 0
  fi

  echo "${SERVICE_ICON} ${SERVICE_NAME}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 Found process(es): $pids"

  local pid
  for pid in $pids; do
    kill "$pid" 2>/dev/null && echo "✅ Stopped PID $pid" || echo "❌ Failed to stop PID $pid"
  done

  sleep 1
  local still_running
  still_running=$(get_pid)
  if [ -z "$still_running" ]; then
    rm -f "$PID_FILE"
    echo ""
    echo "✅ ${SERVICE_NAME} stopped."
  else
    echo ""
    echo "⚠️  ${SERVICE_NAME} may still be running."
    return 1
  fi
}

# Show service status
do_status() {
  load_app_config

  local running_pid
  running_pid=$(get_pid)
  if [ -z "$running_pid" ]; then
    echo "ℹ️  ${SERVICE_NAME} is not running."
    return 1
  fi

  echo "${SERVICE_ICON} ${SERVICE_NAME}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Status: Running"
  echo "   PID:  $running_pid"
  echo "   Port: ${PORT:-3234}"

  if [ -f "/proc/$running_pid/status" ]; then
    local mem_kb
    mem_kb=$(awk '/VmRSS/{print $2}' "/proc/$running_pid/status" 2>/dev/null)
    if [ -n "$mem_kb" ]; then
      echo "   Mem:  $((mem_kb / 1024))MB"
    fi
  fi

  if [ -f "/proc/$running_pid/stat" ]; then
    local start_ticks clk_tck boot_time start_epoch uptime days hours mins
    start_ticks=$(awk '{print $22}' "/proc/$running_pid/stat")
    clk_tck=100
    boot_time=$(awk '/btime/{print $2}' /proc/stat)
    start_epoch=$((boot_time + start_ticks / clk_tck))
    uptime=$(( $(date +%s) - start_epoch ))
    days=$((uptime / 86400))
    hours=$(((uptime % 86400) / 3600))
    mins=$(((uptime % 3600) / 60))
    echo "   Up:   ${days}d ${hours}h ${mins}m"
  fi

  if [ -f "$LOG_FILE" ]; then
    local log_size
    log_size=$(du -h "$LOG_FILE" 2>/dev/null | cut -f1)
    echo "   Log:  $LOG_FILE ($log_size)"
  fi

  echo ""
  echo "   Open: http://${SERVICE_HOST}:${PORT:-3234}"
}

# Restart the service
do_restart() {
  echo "🔄 Restarting ${SERVICE_NAME}..."
  echo ""
  do_stop
  echo ""
  sleep 1
  do_start
}

# Main
case "${1}" in
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  status)
    do_status
    ;;
  restart)
    do_restart
    ;;
  *)
    echo "${SERVICE_ICON} ${SERVICE_NAME} Service Manager"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Usage: bash service.sh {start|stop|status|restart}"
    echo ""
    echo "Commands:"
    echo "  start    - Start the ${SERVICE_NAME} service"
    echo "  stop     - Stop the ${SERVICE_NAME} service"
    echo "  status   - Show current service status"
    echo "  restart  - Restart the service"
    echo ""
    echo "Examples:"
    echo "  bash service.sh start"
    echo "  bash service.sh status"
    echo "  bash service.sh restart"
    echo ""
    return 1 2>/dev/null || exit 1
    ;;
esac