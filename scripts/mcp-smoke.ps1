# MCP smoke harness — drives /api/chat with a list of prompts and prints a pass/fail table.
# Run after the API is up and all configured MCP servers report state=ready.
param(
    [string]$ApiBase = "http://127.0.0.1:4000",
    [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Continue"

$prompts = @(
    @{ Name = "echo_baseline";        Allow = @("everything"); Prompt = "Use the echo tool to repeat the string 'hello tools' back to me." },
    @{ Name = "sum_multi_arg";        Allow = @("everything"); Prompt = "Use get-sum to add 217 and 384." },
    @{ Name = "long_op_timeout";      Allow = @("everything"); Prompt = "Trigger a long-running operation with duration 35 seconds and step count 1. Report whatever you get back, including errors." },
    @{ Name = "research_multi_iter";  Allow = @("everything"); Prompt = "Run a deep research query about UK gilts using the research-query tool. Then summarise what came back." },
    @{ Name = "tasks_real_data";      Allow = @("tasks");      Prompt = "How many tasks do I have in progress, and what are the top three project prefixes by count? Use the task_summary tool." },
    @{ Name = "data_yields_real";     Allow = @("data");       Prompt = "Fetch the current yield curve via get_yields and tell me what the 10y point shows." },
    @{ Name = "data_search_aapl";     Allow = @("data");       Prompt = "Search the workbench instrument catalog for AAPL and report what you find." },
    @{ Name = "data_portfolio_query"; Allow = @("data");       Prompt = "Show me the rows in my portfolio. Pick the right tool: search_monikers wont work for this, query_data with moniker portfolio.positions will." },
    @{ Name = "multi_server";         Allow = @("tasks","data"); Prompt = "How many tasks am I working on, and what does the yield curve look like right now? Use one tool from the tasks server and one from the data server." }
)

$results = @()

foreach ($p in $prompts) {
    Write-Host ("=" * 70)
    Write-Host ("[run] {0}" -f $p.Name) -ForegroundColor Cyan
    Write-Host ("[allow] {0}" -f ($p.Allow -join ", "))
    Write-Host ("[prompt] {0}" -f $p.Prompt)

    $body = @{
        messages = @(@{ role = "user"; content = $p.Prompt })
        mcp = @{ allow = $p.Allow }
    } | ConvertTo-Json -Depth 6 -Compress

    $start = Get-Date
    try {
        $r = Invoke-WebRequest -Uri "$ApiBase/api/chat" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec $TimeoutSec
        $duration = ((Get-Date) - $start).TotalSeconds
        $payload = $r.Content | ConvertFrom-Json
        $traceCount = if ($payload.toolTrace) { $payload.toolTrace.Count } else { 0 }
        $stop = if ($payload.stopReason) { $payload.stopReason } else { "(no stopReason)" }
        $reply = if ($payload.message.content) { $payload.message.content } else { "(empty)" }
        $flat = ($reply -replace "[\r\n]+", " ")
        $cut = [Math]::Min(120, $flat.Length)
        $replyOneLine = if ($cut -gt 0) { $flat.Substring(0, $cut) } else { "(empty)" }

        Write-Host ("[stop] {0}   [tools called] {1}   [duration] {2:N1}s" -f $stop, $traceCount, $duration)
        if ($payload.toolTrace) {
            foreach ($t in $payload.toolTrace) {
                $err = if ($t.error) { " ERROR: $($t.error)" } else { "" }
                Write-Host ("  - {0}.{1} ({2}ms){3}" -f $t.server, $t.tool, $t.durationMs, $err)
            }
        }
        Write-Host ("[reply] {0}" -f $replyOneLine) -ForegroundColor Gray

        $results += [pscustomobject]@{
            Name = $p.Name
            Stop = $stop
            Tools = $traceCount
            DurationS = [Math]::Round($duration, 1)
            Reply = $replyOneLine
        }
    } catch {
        $duration = ((Get-Date) - $start).TotalSeconds
        Write-Host ("[error] {0}" -f $_.Exception.Message) -ForegroundColor Red
        $results += [pscustomobject]@{
            Name = $p.Name
            Stop = "EXCEPTION"
            Tools = 0
            DurationS = [Math]::Round($duration, 1)
            Reply = $_.Exception.Message
        }
    }
}

Write-Host ""
Write-Host ("=" * 70)
Write-Host "Summary" -ForegroundColor Yellow
$results | Format-Table -AutoSize -Wrap
