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

{{- define "streambridge.databaseUrl" -}}
{{- if .Values.backend.secrets.databaseUrl -}}
{{- .Values.backend.secrets.databaseUrl -}}
{{- else if .Values.postgres.enabled -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" .Values.postgres.auth.username .Values.postgres.auth.password (include "streambridge.postgresName" .) .Values.postgres.auth.database -}}
{{- else -}}
{{- fail "Set backend.secrets.databaseUrl when postgres.enabled is false" -}}
{{- end -}}
{{- end -}}
