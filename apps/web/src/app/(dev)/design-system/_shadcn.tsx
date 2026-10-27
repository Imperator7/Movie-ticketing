"use client";

import { AlertCircle, CheckCircle2, Info, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["xs", "sm", "default", "lg", "xl"] as const;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function ShadcnShowcase() {
  return (
    <div className="flex flex-col gap-8">
      <Group title="Buttons">
        <div className="flex flex-col gap-3">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-24 font-mono text-xs text-muted-foreground">{variant}</span>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-mono text-xs text-muted-foreground">states</span>
            <Button disabled>Disabled</Button>
            <Button>
              <Plus aria-hidden data-icon="inline-start" />
              With icon
            </Button>
            <Button size="xl">ซื้อตั๋ว / Buy</Button>
            <Button size="icon" aria-label="Add">
              <Plus aria-hidden />
            </Button>
          </div>
        </div>
      </Group>

      <Group title="Inputs and select">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ds-email">อีเมล</FieldLabel>
            <Input id="ds-email" type="email" placeholder="you@example.com" />
            <FieldDescription>เราจะส่งตั๋วไปที่อีเมลนี้</FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="ds-pass">รหัสผ่าน</FieldLabel>
            <Input id="ds-pass" type="password" aria-invalid defaultValue="123" />
            <FieldError>รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร</FieldError>
          </Field>
          <Field>
            <FieldLabel>โรงภาพยนตร์</FieldLabel>
            <Select defaultValue="siam">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="siam">สยาม</SelectItem>
                <SelectItem value="ladprao">ลาดพร้าว</SelectItem>
                <SelectItem value="rama9">พระราม 9</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Group>

      <Group title="Tabs, badge, card">
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">วันนี้</TabsTrigger>
            <TabsTrigger value="tomorrow">พรุ่งนี้</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="text-sm text-muted-foreground">
            รอบฉายวันนี้ / Today&apos;s showtimes
          </TabsContent>
          <TabsContent value="tomorrow" className="text-sm text-muted-foreground">
            รอบฉายพรุ่งนี้ / Tomorrow&apos;s showtimes
          </TabsContent>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="destructive">destructive</Badge>
        </div>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>ตั๋วของฉัน</CardTitle>
            <CardDescription>My tickets</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">MT-7KQ2XP · A5, A6</CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">
              ดูรายละเอียด
            </Button>
          </CardFooter>
        </Card>
      </Group>

      <Group title="Alerts">
        <div className="grid gap-3">
          <Alert>
            <Info aria-hidden />
            <AlertTitle>Default</AlertTitle>
            <AlertDescription>ข้อความทั่วไป</AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info aria-hidden />
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>รอบฉายนี้มีที่นั่งพรีเมียม</AlertDescription>
          </Alert>
          <Alert variant="success">
            <CheckCircle2 aria-hidden />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>ชำระเงินสำเร็จ</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>เหลือเวลาน้อยกว่า 1 นาที</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>ที่นั่ง A5 ถูกจองไปแล้ว</AlertDescription>
          </Alert>
        </div>
      </Group>

      <Group title="Overlays">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>หมดเวลาชำระเงิน</DialogTitle>
                <DialogDescription>
                  Time&apos;s up. Please choose your seats again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>กลับไปเลือกที่นั่ง</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Alert dialog</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>การย้อนกลับจะยกเลิกการจองนี้</AlertDialogTitle>
                <AlertDialogDescription>
                  Going back will cancel this booking.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>อยู่ต่อ</AlertDialogCancel>
                <AlertDialogAction>ยกเลิกการจอง</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" onClick={() => toast.success("บันทึกแล้ว")}>
            Toast
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Dropdown</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>บัญชีของฉัน</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>ตั๋วของฉัน</DropdownMenuItem>
              <DropdownMenuItem>ออกจากระบบ</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>คำอธิบายสั้น ๆ</TooltipContent>
          </Tooltip>
        </div>
      </Group>

      <Group title="Skeletons">
        <div className="flex max-w-sm items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Group>
    </div>
  );
}
