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
prod-backend-xxx                1/1     Running   0          2m
prod-backend-yyy                1/1     Running   0          2m
prod-postgres-0                 1/1     Running   0          2m
prod-redis-xxx                  1/1     Running   0          2m
prod-worker-xxx                 1/1     Running   0          2m
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

Oczekiwany log:
```
Worker started, waiting for tasks...
Worker got message: NEW_TASK:1:moje pierwsze zadanie
```

## 7. Dowód trwałości danych (StatefulSet + PVC)

1. Dodaj zadanie:
```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"zadanie trwale"}'
```

2. Usuń pod bazy:
```bash
kubectl delete pod prod-postgres-0 -n tasks-app
```

3. Poczekaj aż pod się odtworzy (~30 sekund):
```bash
kubectl get pods -n tasks-app
```

4. Wznów port-forward (po restarcie poda może być potrzebne):
```bash
kubectl port-forward svc/prod-backend 8080:80 -n tasks-app
```

5. Sprawdź że dane nadal są:
```bash
curl http://localhost:8080/tasks
```

Oczekiwany wynik — zadanie nadal istnieje mimo restartu poda bazy.

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
prod-backend-pdb   1               N/A               1                     5m
```

## 11. CI/CD - ostatni udany workflow

Link do workflow:
```
https://github.com/jkaminska2/projekt-kubernetes/actions
```

Pipeline wykonuje:
- build obrazu backend
- build obrazu worker
- walidacja manifestów przez `kustomize build`
- push obrazów do GHCR
- `kubectl apply -k k8s/prod`
- `kubectl rollout status deployment/prod-backend`
- `kubectl rollout status deployment/prod-worker`
