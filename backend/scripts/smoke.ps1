$ErrorActionPreference = "Stop"
$base = "http://localhost:8080/api/v1"
$email = "smoke+$([guid]::NewGuid().ToString('N').Substring(0,8))@leknowde.test"
$password = "MineralSignal!2026"
$script:checks = 0

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body,
    [string]$Token
  )
  $headers = @{ Accept = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $params = @{
    Method      = $Method
    Uri         = "$base$Path"
    Headers     = $headers
    TimeoutSec  = 120
  }
  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }
  Invoke-RestMethod @params
}

function Get-R([string]$Path, [string]$Token) { Invoke-Api -Method Get -Path $Path -Token $Token }
function Post([string]$Path, $Body, [string]$Token) { Invoke-Api -Method Post -Path $Path -Body $Body -Token $Token }
function Delete-R([string]$Path, [string]$Token) { Invoke-Api -Method Delete -Path $Path -Token $Token }

function Expect {
  param([bool]$Condition, [string]$Message)
  $script:checks++
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
  Write-Host "   ok: $Message"
}

Write-Host "1. health"
$health = Get-R "/health"
Write-Host "   status=$($health.status) db=$($health.database.driver) ai=$($health.ai_service.status) parser=$($health.ai_service.detail.parser) llm=$($health.ai_service.detail.llm.configured)"
Expect ($health.status -eq "ok") "API status is ok"
Expect ($health.database.status -eq "ok") "database is reachable"
Expect ($health.ai_service.status -eq "ok") "AI service is reachable"

Write-Host "2. register"
$reg = Post "/auth/register" @{ email = $email; password = $password; name = "Smoke Tester" } $null
$token = $reg.token
Expect ([bool]$token) "registration returned a session token"
Write-Host "   user=$($reg.user.id) org=$($reg.organization_id)"

Write-Host "3. me + preferences"
$me = Get-R "/auth/me" $token
Expect ($me.user.email -eq $email) "session resolves to the registered account"
$prefs = Invoke-Api -Method Put -Path "/users/me/preferences" -Body @{ theme = "light"; default_workspace_id = "" } -Token $token
Expect ($prefs.theme -eq "light") "preferences can be updated"
$me = Get-R "/auth/me" $token
Expect ($me.preferences.theme -eq "light") "preferences are persisted"
$profile = Invoke-Api -Method Patch -Path "/users/me" -Body @{ name = "Smoke Tester"; avatar_url = "" } -Token $token
Expect ($profile.status -eq "updated") "profile update is accepted"

Write-Host "4. workspaces"
$wsList = Get-R "/workspaces" $token
$ws = $wsList.workspaces | Select-Object -First 1
if (-not $ws) { $ws = (Post "/workspaces" @{ name = "Smoke Workspace"; description = "temporary smoke test" } $token).workspace }
Expect ([bool]$ws.id) "workspace is available"
Write-Host "   workspace=$($ws.id) $($ws.name)"

Write-Host "5. connect demo repo"
$demo = Post "/repositories/demo" @{ workspace_id = $ws.id } $token
$repo = $demo.repository
$job = $demo.job
Expect ($repo.is_demo -eq $true) "repository is labelled as demo"
Expect ([bool]$job.id) "index job was queued"
Write-Host "   repo=$($repo.id) job=$($job.id) status=$($job.status)"

Write-Host "6. wait for index"
$j = $null
for ($i = 0; $i -lt 120; $i++) {
  $j = Get-R "/jobs/$($job.id)" $token
  if ($j.status -in @("completed", "failed")) { break }
  Start-Sleep -Milliseconds 800
}
Write-Host "   job status=$($j.status) files=$($j.files_processed) symbols=$($j.symbols_found)"
if ($j.error) { Write-Host "   job error: $($j.error)" }
Expect ($j.status -eq "completed") "index job completed"
Expect ($j.files_processed -gt 0) "index job processed source files"
Expect ($j.symbols_found -gt 0) "index job extracted symbols"

Write-Host "7. overview"
$ov = Get-R "/repositories/$($repo.id)/overview" $token
$languageCount = 0
if ($ov.stats.languages) { $languageCount = @($ov.stats.languages.PSObject.Properties).Count }
Write-Host "   files=$($ov.stats.files) symbols=$($ov.stats.symbols) lines=$($ov.stats.lines) langs=$languageCount parser=$($ov.repository.parser_mode)"
Expect ($ov.stats.files -gt 0) "overview reports indexed files"
Expect ($ov.stats.symbols -gt 0) "overview reports indexed symbols"
Expect ($ov.graph.nodes -gt 0) "overview reports graph nodes"
Expect ($languageCount -gt 0) "overview reports languages"

Write-Host "8. tree"
$tree = Get-R "/repositories/$($repo.id)/tree" $token
Write-Host "   files=$($tree.count) roots=$($tree.tree.Count)"
Expect ($tree.count -gt 0) "tree lists indexed files"

Write-Host "9. file"
$file = Get-R "/repositories/$($repo.id)/file?path=server/src/auth/refresh.ts" $token
Write-Host "   path=$($file.file.path) lines=$($file.file.line_count) symbols=$($file.symbols.Count) deps=$($file.dependencies.Count)"
Expect ($file.file.path -eq "server/src/auth/refresh.ts") "file content is served for a known path"
Expect ($file.file.content.Length -gt 0) "file content is non-empty"

Write-Host "10. symbols + search"
$syms = Get-R "/repositories/$($repo.id)/symbols?limit=5" $token
Write-Host "   count=$($syms.count) sample=$(($syms.symbols | ForEach-Object { $_.name + ':' + $_.kind }) -join ', ')"
Expect ($syms.count -gt 0) "symbols endpoint returns records"
$search = Get-R "/repositories/$($repo.id)/search?q=refresh%20token" $token
Write-Host "   strategy=$($search.strategy) candidates=$($search.candidates) files=$($search.files.Count) evidence=$($search.evidence.Count)"
Expect ($search.strategy -ne $null -and $search.strategy -ne "") "search reports its retrieval strategy"
Expect ($search.evidence.Count -gt 0) "search returns evidence snippets"

Write-Host "11. graph + dependencies"
$graph = Get-R "/repositories/$($repo.id)/graph?view=architecture&limit=200" $token
Write-Host "   view=$($graph.view) nodes=$($graph.graph.nodes.Count) edges=$($graph.graph.edges.Count) truncated=$($graph.graph.truncated)"
Expect ($graph.graph.nodes.Count -gt 0) "architecture graph has nodes"
$deps = Get-R "/repositories/$($repo.id)/dependencies" $token
Write-Host "   modules=$($deps.modules.Count) cycles=$($deps.cycles.Count) unused=$($deps.unused_imports.Count)"
Expect ($null -ne $deps.summary) "dependency summary is present"

Write-Host "12. health report"
$hr = Get-R "/repositories/$($repo.id)/health" $token
Write-Host "   score=$($hr.summary.score) grade=$($hr.summary.grade) findings=$($hr.findings.Count) severity=$(($hr.summary.by_severity.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value }) -join ',')"
Expect ($hr.summary.score -ge 0 -and $hr.summary.score -le 100) "health score is in range"
Expect ($hr.summary.metrics.files -gt 0) "health metrics include files"
Expect ($hr.summary.limitations.Count -gt 0) "health report states its limitations"

Write-Host "13. onboarding"
$onb = Get-R "/repositories/$($repo.id)/onboarding" $token
Write-Host "   steps=$($onb.steps.Count) questions=$($onb.questions_to_ask_the_codebase.Count) key_files=$($onb.key_files.Count) hours=$($onb.estimated_hours)"
Expect ($onb.steps.Count -gt 0) "onboarding plan has steps"
Expect ($onb.facts.stats.files -gt 0) "onboarding facts include file counts"

Write-Host "14. digital twin"
$twin = Get-R "/repositories/$($repo.id)/twin?limit=300" $token
Write-Host "   nodes=$($twin.nodes) edges=$($twin.edges) kinds=$($twin.kinds.Count) rendered=$($twin.graph.nodes.Count)"
Expect ($twin.nodes -gt 0) "twin reports graph nodes"
Expect ($twin.kinds.Count -gt 0) "twin reports node kinds"
Expect ($twin.graph.nodes.Count -gt 0) "twin returns a renderable graph"

Write-Host "15. impact"
$imp = Post "/repositories/$($repo.id)/impact" @{ request = "Change how refresh token rotation detects reuse" } $token
$a = $imp.analysis
Write-Host "   seeds=$($a.seeds.Count) affected=$($a.affected_files.Count) risk=$($a.risk.score)/$($a.risk.level) tests=$($a.existing_tests.Count) narrative=$($a.ai_narrative_status)"
Expect ([bool]$imp.report.id) "impact report was saved"
Expect ($a.risk.score -ge 0) "impact risk score is present"
Expect ($a.risk.factors.Count -gt 0) "impact risk exposes its factors"
Expect ($a.affected_files.Count -gt 0) "impact analysis lists affected files"
Expect ($a.ai_narrative_status -notmatch "422") "impact narrative payload is accepted by the AI service"

Write-Host "16. document"
$doc = Post "/repositories/$($repo.id)/documents" @{ kind = "architecture" } $token
Write-Host "   doc=$($doc.document.id) title=$($doc.document.title) status=$($doc.document.status) model_generated=$($doc.generated_by_model) provider=$($doc.provider)"
Expect ([bool]$doc.document.id) "document was generated and stored"
Expect ($doc.document.content.Length -gt 100) "document has content"
Expect ($doc.document.status -eq "draft") "generated document starts as a draft"
$docList = Get-R "/repositories/$($repo.id)/documents" $token
Expect ($docList.documents.Count -gt 0) "document list returns the stored document"

Write-Host "17. chat"
$chat = Post "/repositories/$($repo.id)/chat" @{ question = "How does refresh token rotation work?" } $token
Write-Host "   completed=$($chat.completed) confidence=$($chat.confidence) evidence=$($chat.evidence.Count) notice=$($chat.notice)"
Expect ($chat.evidence.Count -gt 0) "chat returns retrieved evidence"
if ($chat.completed -eq $false) {
  Expect ([bool]$chat.notice) "chat without a provider explains why no answer was generated"
}
$conversations = Get-R "/repositories/$($repo.id)/conversations" $token
Expect ($conversations.conversations.Count -gt 0) "chat created a conversation record"

Write-Host "18. pull requests"
$prs = Get-R "/repositories/$($repo.id)/pull-requests" $token
Write-Host "   prs=$($prs.pull_requests.Count) demo=$($prs.demo) provider=$($prs.provider)"
Expect ($prs.pull_requests.Count -gt 0) "demo pull requests are available"
$prNumber = $prs.pull_requests[0].number
$prAnalysis = Post "/repositories/$($repo.id)/pull-requests/$prNumber/analyze?number=$prNumber" @{} $token
Write-Host "   pr=$prNumber files=$($prAnalysis.files.Count) affected=$($prAnalysis.impact.Count) risk=$($prAnalysis.risk.score)/$($prAnalysis.risk.level) missing_tests=$($prAnalysis.missing_tests.Count)"
Expect ($prAnalysis.risk.score -ge 0) "PR analysis returns a risk score"
Expect ($prAnalysis.review_recommendations.Count -gt 0) "PR analysis returns review recommendations"

Write-Host "19. dashboard"
$dash = Get-R "/dashboard" $token
Write-Host "   repos=$($dash.stats.repositories) ready=$($dash.stats.ready_repositories) files=$($dash.stats.files) findings=$($dash.stats.findings)"
Expect ($dash.stats.repositories -ge 1) "dashboard counts the repository"
Expect ($dash.recent_repositories.Count -ge 1) "dashboard lists recent repositories"

Write-Host "20. notifications + audit"
$notes = Get-R "/notifications" $token
Write-Host "   notifications=$($notes.notifications.Count) unread=$($notes.unread)"
Expect ($notes.notifications.Count -gt 0) "indexing produced a notification"
if ($notes.unread -gt 0) {
  $read = Post "/notifications/read" @{} $token
  Expect ($read.status -eq "updated") "notifications can be marked read"
}
$audit = Get-R "/audit-logs?limit=50" $token
Write-Host "   audit=$($audit.logs.Count)"
Expect ($audit.logs.Count -gt 0) "audit log records actions"

Write-Host "21. integrations"
$integrations = Get-R "/integrations" $token
Write-Host "   connected=$($integrations.integrations.Count) github_oauth=$($integrations.github_oauth_enabled)"
Expect ($null -ne $integrations.integrations) "integrations endpoint responds"

Write-Host "22. cleanup"
$deleted = Delete-R "/repositories/$($repo.id)" $token
Expect ($deleted.status -eq "deleted") "smoke repository was deleted"
$stillThere = $false
try {
  Get-R "/repositories/$($repo.id)" $token | Out-Null
  $stillThere = $true
} catch {
  $stillThere = $false
}
Expect (-not $stillThere) "deleted repository is no longer readable"

Write-Host ""
Write-Host "SMOKE_OK checks=$script:checks repo=$($repo.id)"
