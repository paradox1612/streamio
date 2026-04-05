{{- define "streambridge.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "streambridge.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "streambridge.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "streambridge.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "streambridge.labels" -}}
helm.sh/chart: {{ include "streambridge.chart" . }}
app.kubernetes.io/name: {{ include "streambridge.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "streambridge.selectorLabels" -}}
app.kubernetes.io/name: {{ include "streambridge.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "streambridge.frontendName" -}}
{{- printf "%s-frontend" (include "streambridge.fullname" .) -}}
{{- end -}}

{{- define "streambridge.backendName" -}}
{{- printf "%s-backend" (include "streambridge.fullname" .) -}}
{{- end -}}

{{- define "streambridge.postgresName" -}}
{{- printf "%s-postgres" (include "streambridge.fullname" .) -}}
{{- end -}}

{{- define "streambridge.postgresAuthSecretName" -}}
{{- if .Values.postgres.auth.existingSecret -}}
{{- .Values.postgres.auth.existingSecret -}}
{{- else -}}
{{- printf "%s-auth" (include "streambridge.postgresName" .) -}}
{{- end -}}
{{- end -}}

{{- define "streambridge.postgresAuthSecretChecksum" -}}
{{- if .Values.postgres.auth.existingSecret -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace (include "streambridge.postgresAuthSecretName" .) -}}
{{- if $secret -}}
{{- toYaml $secret.data | sha256sum -}}
{{- else -}}
missing-secret
{{- end -}}
{{- else -}}
{{- include (print $.Template.BasePath "/postgres-secret.yaml") . | sha256sum -}}
{{- end -}}
{{- end -}}

{{- define "streambridge.databaseUrl" -}}
{{- if .Values.backend.secrets.databaseUrl -}}
{{- .Values.backend.secrets.databaseUrl -}}
{{- else if .Values.postgres.enabled -}}
{{- $secretName := include "streambridge.postgresAuthSecretName" . -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace $secretName -}}
{{- if not $secret -}}
{{- fail (printf "postgres auth secret %s not found" $secretName) -}}
{{- end -}}
{{- $keys := .Values.postgres.auth.secretKeys -}}
{{- $username := (index $secret.data $keys.username | b64dec) -}}
{{- $password := (index $secret.data $keys.password | b64dec) -}}
{{- $database := (index $secret.data $keys.database | b64dec) -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" (urlquery $username) (urlquery $password) (include "streambridge.postgresName" .) $database -}}
{{- else -}}
{{- fail "Set backend.secrets.databaseUrl when postgres.enabled is false" -}}
{{- end -}}
{{- end -}}
