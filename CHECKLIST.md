# CHECKLIST - Task App (Kubernetes + CI/CD)

## 1. Uruchomienie klastra

### k3d (zalecane)
```bash
k3d cluster create tasks --api-port 6550 -p "80:80@loadbalancer"
```

### kind
```bash
kind create cluster --name tasks
```

### minikube
```bash
minikube start
```

Sprawdzenie:
```bash
kubectl get nodes
```

## 2. Instalacja Ingress-Nginx

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

Poczekaj aż pod będzie Running:
```bash
kubectl get pods -n ingress-nginx
```

## 3. Wdrożenie aplikacji (Kustomize - środowisko prod)

```bash
kubectl apply -k k8s/prod
```

Poczekaj ~60 sekund na pobranie obrazów, potem sprawdź:
```bash
kubectl get pods -n tasks-app
kubectl get svc -n tasks-app
kubectl get ingress -n tasks-app
kubectl get pvc -n tasks-app
kubectl get pdb -n tasks-app
```

Oczekiwany wynik `get pods`:
```
NAME                            READY   STATUS    RESTARTS   AGE
prod-backend-6b6bbd5bb6-9gb95   1/1     Running   0          2m
prod-backend-6b6bbd5bb6-p7pfn   1/1     Running   0          2m
prod-postgres-0                 1/1     Running   0          2m
prod-redis-cd97bf494-pfbhb      1/1     Running   0          2m
prod-worker-75f64d56db-6lwzd    1/1     Running   0          2m
```

Oczekiwany wynik `get pvc`:
```
NAME                            STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-data-prod-postgres-0   Bound    pvc-86f9054a-2391-4ae9-b000-860243937b5f   1Gi        RWO            local-path     2m
```

## 4. Udostępnienie aplikacji przez port-forward

Ponieważ k3d używa Traefika jako domyślnego ingress controllera, aplikację udostępniamy przez port-forward:

```bash
kubectl port-forward svc/prod-backend 8080:80 -n tasks-app
```

Zostaw to polecenie działające w osobnym terminalu przez cały czas testowania.

## 5. Testy działania aplikacji

### 5.1 Healthcheck backendu

```bash
curl http://localhost:8080/health
```

Oczekiwany wynik:
```json
{"status":"ok"}
```

### 5.2 Dodanie zadania

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"moje pierwsze zadanie"}'
```

Oczekiwany wynik:
```json
{"id":1,"title":"moje pierwsze zadanie"}
```

### 5.3 Pobieranie listy zadań

```bash
curl http://localhost:8080/tasks
```

Oczekiwany wynik:
```json
{"tasks":[{"id":1,"title":"moje pierwsze zadanie"}]}
```

## 6. Dowód działania workera (Redis queue)

Worker loguje każde zadanie pobrane z kolejki Redis:

```bash
kubectl logs deployment/prod-worker -n tasks-app
```

Oczekiwany wynik:
```
> tasks-worker@1.0.0 start
> node worker.js

Worker started, waiting for tasks...
Worker got message: NEW_TASK:1:moje pierwsze zadanie
```

## 7. Dowód trwałości danych (StatefulSet + PVC)

1. Dodaj zadanie:
```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"moje pierwsze zadanie"}'
```

2. Usuń pod bazy:
```bash
kubectl delete pod prod-postgres-0 -n tasks-app
```

3. Poczekaj aż pod się odtworzy (~30 sekund):
```bash
kubectl get pods -n tasks-app
```

4. Wznów port-forward:
```bash
kubectl port-forward svc/prod-backend 8080:80 -n tasks-app
```

5. Sprawdź że dane nadal są:
```bash
curl http://localhost:8080/tasks
```

Oczekiwany wynik — wszystkie zadania nadal istnieją mimo restartu poda bazy:
```json
{"tasks":[{"id":1,"title":"moje pierwsze zadanie"},{"id":2,"title":"moje pierwsze zadanie"},{"id":3,"title":"moje pierwsze zadanie"},{"id":4,"title":"moje pierwsze zadanie"},{"id":5,"title":"moje pierwsze zadanie"}]}
```

## 8. Rolling update backendu

```bash
kubectl rollout status deployment/prod-backend -n tasks-app
```

Oczekiwany wynik:
```
deployment "prod-backend" successfully rolled out
```

## 9. NetworkPolicy - dowód izolacji

Uruchom testowy pod i spróbuj połączyć się z bazą:

```bash
kubectl run test --rm -it --image=alpine -n tasks-app -- sh
```

W shellu poda:
```bash
apk add postgresql-client
psql -h prod-postgres -U tasksuser tasksdb
```

Oczekiwany wynik — połączenie odrzucone:
```
psql: error: connection to server on socket failed: Connection refused
```

Backend i worker mają dostęp (zdefiniowane w NetworkPolicy), inne pody nie.

## 10. PodDisruptionBudget - dowód działania

```bash
kubectl get pdb -n tasks-app
```

Oczekiwany wynik:
```
NAME               MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
prod-backend-pdb   1               N/A               1                     70m
```

## 11. CI/CD - ostatni udany workflow

Link do workflow:
```
https://github.com/jkaminska2/projekt-kubernetes/actions/runs/26790132652
```

Pipeline wykonuje:
- build obrazu backend i worker
- walidacja manifestów przez `kustomize build`
- push obrazów do GHCR (`ghcr.io/jkaminska2/tasks-backend:prod`, `ghcr.io/jkaminska2/tasks-worker:prod`)
- deploy wykonywany lokalnie: `kubectl apply -k k8s/prod`

## 12. Obserwowalność - metryki Prometheusa

Backend udostępnia endpoint `/metrics` z metrykami w formacie Prometheus:

```bash
kubectl port-forward svc/prod-backend 8080:80 -n tasks-app
curl http://localhost:8080/metrics
```

Oczekiwany wynik (fragment):
```
# HELP tasks_created_total Liczba utworzonych zadań
# TYPE tasks_created_total counter
tasks_created_total 1
# HELP http_requests_total Liczba zapytań HTTP
# TYPE http_requests_total counter
http_requests_total{method="POST",path="/tasks",status="201"} 1
http_requests_total{method="GET",path="/tasks",status="200"} 1
```

Adnotacje Prometheusa na podach backendu:
```bash
kubectl get pod -n tasks-app -l app=backend -o jsonpath='{.items[0].metadata.annotations}' | jq .
```

Oczekiwany wynik:
```json
{
  "prometheus.io/path": "/metrics",
  "prometheus.io/port": "8000",
  "prometheus.io/scrape": "true"
}