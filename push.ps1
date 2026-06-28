# ───────────────────────────────────────────
# push.ps1 — گۆڕانکارییەکان بنێرە بۆ GitHub
# بەکارهێنان: .\push.ps1 "پیامی گۆڕانکاری"
# ───────────────────────────────────────────

param(
    [string]$msg = ""
)

# جا بچۆ بۆ فۆڵدەری پڕۆژەکە
Set-Location $PSScriptRoot

# بینینی بارودۆخی گۆڕانکارییەکان
$status = git status --porcelain
if (-not $status) {
    Write-Host "✅ هیچ گۆڕانکارییەک نییە بۆ ناردن." -ForegroundColor Green
    exit 0
}

Write-Host "📋 گۆڕانکارییەکانی ئێستا:" -ForegroundColor Cyan
git status --short

# پرسیار لە بەکارهێنەر ئەگەر پەیام نەبوو
if (-not $msg) {
    $msg = Read-Host "`n📝 پەیامی commit بنووسە (یان Enter بدە بۆ پەیامی خۆکار)"
    if (-not $msg) {
        $date = Get-Date -Format "yyyy-MM-dd HH:mm"
        $msg = "update: گۆڕانکاری $date"
    }
}

Write-Host "`n⬆️  ناردن بۆ GitHub..." -ForegroundColor Yellow

# Git commands
git add -A
git commit -m $msg
$pushResult = git push origin main 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ بە سەرکەوتوویی ناردرا بۆ GitHub! 🎉" -ForegroundColor Green
    Write-Host "🔗 https://github.com/muhamadazizmuhamad98-sketch/gazxzna-web" -ForegroundColor Blue
} else {
    Write-Host "`n❌ هەڵە ڕوویدا لە کاتی ناردن:" -ForegroundColor Red
    Write-Host $pushResult -ForegroundColor Red
    Write-Host "`n💡 تکایە دڵنیابە لە پەیوەندی ئینتەرنێتەکەت و ڕازیبوونی GitHub." -ForegroundColor Yellow
}

Read-Host "`nEnter بدە بۆ داخستن"
