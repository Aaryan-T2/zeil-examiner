param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$State,

  [string]$Question = "Does this request require urgent attention?",

  [string]$Model = $env:NINEROUTER_SYSTEMONE_MODEL
)

$ErrorActionPreference = 'Stop'

$baseUrl = $env:NINEROUTER_URL
$apiKey = $env:NINEROUTER_KEY

if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = 'http://localhost:20128'
}
if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = 'oc/jev-1.13-free'
}
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw 'NINEROUTER_KEY is not set. Set it in your local environment; do not put it in this script.'
}

$uri = $baseUrl.TrimEnd('/') + '/v1/systemone'
$payload = @{
  model = $Model
  state = $State
  questions = @{
    is_urgent = @{
      type = 'noul'
      instructions = $Question
    }
  }
} | ConvertTo-Json -Depth 8

$headers = @{ Authorization = "Bearer $apiKey" }
$result = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $payload
$result | ConvertTo-Json -Depth 12
